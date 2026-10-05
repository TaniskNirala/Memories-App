import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { queryOne, run } from '../db.ts';
import { AuthenticatedRequest, requireApproved } from '../middleware/auth.ts';
import { getStorageAdapter } from '../storage/index.ts';

export const aiRouter = Router();
aiRouter.use(requireApproved);

const upload = multer({
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max for vision analysis
});

// Helper to safely get base64 data from file or storage key
async function getImageBase64(storageKey?: string, localPath?: string, directBase64?: string): Promise<{ base64: string; mimeType: string } | null> {
  if (directBase64) {
    const cleaned = directBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    const mimeMatch = directBase64.match(/^data:(image\/[a-z]+);base64,/);
    return {
      base64: cleaned,
      mimeType: mimeMatch ? mimeMatch[1] : 'image/jpeg',
    };
  }

  if (localPath && fs.existsSync(localPath)) {
    const buffer = fs.readFileSync(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return { base64: buffer.toString('base64'), mimeType };
  }

  if (storageKey) {
    // 1. Try local disk uploads folder
    const localUploadPath = path.resolve(process.cwd(), 'uploads', storageKey.replace(/^posts\//, 'posts/'));
    if (fs.existsSync(localUploadPath)) {
      const buffer = fs.readFileSync(localUploadPath);
      const ext = path.extname(localUploadPath).toLowerCase();
      const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return { base64: buffer.toString('base64'), mimeType };
    }

    // 2. Fetch from storage adapter
    try {
      const storage = getStorageAdapter();
      if (storage.getObject) {
        const obj = await storage.getObject(storageKey);
        if (obj && obj.data) {
          return {
            base64: obj.data.toString('base64'),
            mimeType: obj.contentType || 'image/jpeg',
          };
        }
      }
    } catch (e) {
      console.warn('Could not fetch object from storage adapter for AI captioning:', e);
    }
  }

  return null;
}

// Smart heuristic fallback if AI rate limit or 503 occurs
function getHeuristicCaptions(tone?: string, context?: string): { caption: string; suggestions: Array<{ tone: string; text: string }>; tags: string[] } {
  const currentHour = new Date().getHours();
  const timeOfDay = currentHour < 12 ? 'morning' : currentHour < 17 ? 'afternoon' : 'golden hour';
  const month = new Date().toLocaleString('default', { month: 'long' });

  const warm = context
    ? `Treasured memories of ${context} — moments we'll keep forever.`
    : `Pure warmth and genuine smiles during this beautiful ${timeOfDay}.`;

  const witty = `Proof that the best memories aren't planned, they just happen.`;
  const minimalist = `${month} stillness.`;

  const chosen = tone === 'witty' ? witty : tone === 'short' ? minimalist : warm;

  return {
    caption: chosen,
    suggestions: [
      { tone: 'Warm & Nostalgic', text: warm },
      { tone: 'Fun & Witty', text: witty },
      { tone: 'Short & Minimal', text: minimalist },
    ],
    tags: ['#Kinfolk', '#Memories', '#GoodTimes', '#Unfiltered'],
  };
}

// Generate captions from image data or storage key
aiRouter.post('/generate-caption', upload.single('image'), async (req: AuthenticatedRequest, res) => {
  try {
    const { storageKey, imageBase64, tone = 'warm', context } = req.body;
    let localFilePath = req.file?.path;

    const imgData = await getImageBase64(storageKey, localFilePath, imageBase64);

    if (!imgData) {
      // Return heuristic response if image not provided
      const fallback = getHeuristicCaptions(tone, context);
      return res.json({ success: true, ...fallback, source: 'heuristic' });
    }

    // Call Gemini API with @google/genai
    const prompt = `You are a thoughtful, warm memory curator for a private close-friends and family photo vault called Kinfolk.
Analyze this photo and write a natural, genuine caption that captures the moment, emotion, scenery, people, or atmosphere.
Avoid generic AI clichés like "In a world of..." or "A snapshot frozen in time". Write authentic captions people would actually share in a private family group.

Requested tone: ${tone} (e.g. warm, witty, poetic, short, or descriptive).
${context ? `Additional user context: "${context}".` : ''}

Respond ONLY with valid JSON in this exact structure:
{
  "caption": "The best recommended primary caption",
  "suggestions": [
    { "tone": "Warm & Nostalgic", "text": "A warm, sentimental one-line memory caption" },
    { "tone": "Fun & Witty", "text": "A witty, lighthearted, or playful one-line caption" },
    { "tone": "Short & Minimal", "text": "A minimal, aesthetic 3-5 word caption" }
  ],
  "tags": ["#Tag1", "#Tag2", "#Tag3"]
}`;

    const ai = new GoogleGenAI();
    let textOutput = '';

    // First attempt: gemini-3.8-flash
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: imgData.mimeType,
                  data: imgData.base64,
                },
              },
              { text: prompt },
            ],
          },
        ],
      });
      textOutput = response.text || '';
    } catch (modelErr: any) {
      console.warn('gemini-3.8-flash retry fallback:', modelErr.message);
      // Secondary attempt: gemini-flash-latest
      try {
        const fallbackRes = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: imgData.mimeType,
                    data: imgData.base64,
                  },
                },
                { text: prompt },
              ],
            },
          ],
        });
        textOutput = fallbackRes.text || '';
      } catch (secErr) {
        console.warn('AI fallback to heuristic captions:', secErr);
        const fallback = getHeuristicCaptions(tone, context);
        return res.json({ success: true, ...fallback, source: 'heuristic' });
      }
    }

    // Clean JSON markdown fences if present
    const cleanedJson = textOutput
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    try {
      const parsed = JSON.parse(cleanedJson);
      return res.json({
        success: true,
        caption: parsed.caption || parsed.suggestions?.[0]?.text || 'Cherished moment.',
        suggestions: parsed.suggestions || [],
        tags: parsed.tags || [],
        source: 'gemini',
      });
    } catch (parseErr) {
      // If output was raw text instead of JSON
      const firstLine = textOutput.split('\n')[0].replace(/^["']|["']$/g, '').trim();
      return res.json({
        success: true,
        caption: firstLine || 'Cherished memory together.',
        suggestions: [
          { tone: 'Warm & Nostalgic', text: firstLine },
          { tone: 'Short & Minimal', text: firstLine.slice(0, 40) },
        ],
        tags: ['#Kinfolk', '#Memories'],
        source: 'gemini_raw',
      });
    }
  } catch (error: any) {
    console.error('Caption generation error:', error);
    const fallback = getHeuristicCaptions(req.body?.tone, req.body?.context);
    return res.json({ success: true, ...fallback, source: 'heuristic_recovered' });
  } finally {
    // Clean up temporary multipart file if stored on disk
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }
  }
});

// Auto-caption an existing post in the database
aiRouter.post('/caption-post/:postId', async (req: AuthenticatedRequest, res) => {
  try {
    const { postId } = req.params;
    const { tone = 'warm', updateDatabase = false } = req.body;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    const post = queryOne<any>('SELECT * FROM posts WHERE id = ?', [postId]);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (!isAdmin && post.owner_id !== userId) {
      return res.status(403).json({ error: 'Only the memory owner or an admin can update caption' });
    }

    const firstFile = queryOne<any>(
      'SELECT storage_key, thumb_key, mime_type FROM post_files WHERE post_id = ? ORDER BY position ASC LIMIT 1',
      [postId]
    );

    if (!firstFile) {
      return res.status(400).json({ error: 'Post has no photos to analyze' });
    }

    const imgData = await getImageBase64(firstFile.storage_key);
    let result: any;

    if (imgData) {
      const ai = new GoogleGenAI();
      const prompt = `Write a warm, authentic 1-sentence caption for this photo in a private family memory book. Tone: ${tone}. Respond with just JSON: { "caption": "...", "suggestions": [{ "tone": "Warm", "text": "..." }, { "tone": "Witty", "text": "..." }, { "tone": "Minimal", "text": "..." }] }`;

      try {
        const aiRes = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: imgData.mimeType, data: imgData.base64 } },
                { text: prompt },
              ],
            },
          ],
        });
        const cleaned = (aiRes.text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
        result = JSON.parse(cleaned);
      } catch {
        result = getHeuristicCaptions(tone);
      }
    } else {
      result = getHeuristicCaptions(tone);
    }

    const newCaption = result.caption || result.suggestions?.[0]?.text || 'Treasured memories.';

    if (updateDatabase) {
      run('UPDATE posts SET caption = ? WHERE id = ?', [newCaption, postId]);
    }

    res.json({
      success: true,
      currentCaption: post.caption,
      caption: newCaption,
      suggestions: result.suggestions || [],
      message: 'Caption generated successfully',
    });
  } catch (err: any) {
    console.error('Caption post error:', err);
    res.status(500).json({ error: err.message || 'Failed to auto-caption memory' });
  }
});
