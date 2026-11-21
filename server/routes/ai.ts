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

export interface TemporalContext {
  dateStr: string;
  formattedDate: string;
  year: number;
  monthName: string;
  season: string;
  timeOfDay?: string;
  yearsAgo: number;
  monthsAgo: number;
  relativeTimeDescription: string;
  era: string;
  isThrowback: boolean;
  isVintage: boolean;
}

export function formatTemporalContext(dateInput?: string): TemporalContext | null {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;

  const now = new Date();
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-11
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const monthName = monthNames[month];

  // Season
  let season = 'Autumn / Fall';
  if (month >= 2 && month <= 4) season = 'Spring';
  else if (month >= 5 && month <= 7) season = 'Summer';
  else if (month >= 8 && month <= 10) season = 'Autumn / Fall';
  else season = 'Winter';

  // Time of day if timestamp has hour details
  let timeOfDay: string | undefined;
  if (dateInput.includes('T') || (dateInput.includes(':') && !dateInput.endsWith('00:00:00.000Z'))) {
    const hours = d.getHours();
    if (hours >= 5 && hours < 11) timeOfDay = 'morning';
    else if (hours >= 11 && hours < 16) timeOfDay = 'afternoon';
    else if (hours >= 16 && hours < 19) timeOfDay = 'golden hour / sunset';
    else if (hours >= 19 && hours < 23) timeOfDay = 'evening';
    else timeOfDay = 'night';
  }

  // Elapsed time calculations
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const yearsAgo = Math.floor(diffDays / 365.25);
  const monthsAgo = Math.floor(diffDays / 30.4);

  let relativeTimeDescription = '';
  if (yearsAgo >= 25) {
    relativeTimeDescription = `Vintage retro memory from ${year} (${yearsAgo} years ago)`;
  } else if (yearsAgo >= 10) {
    relativeTimeDescription = `Decade-plus throwback to ${monthName} ${year} (${yearsAgo} years ago)`;
  } else if (yearsAgo >= 2) {
    relativeTimeDescription = `Throwback to ${monthName} ${year} (${yearsAgo} years ago)`;
  } else if (yearsAgo === 1) {
    relativeTimeDescription = `Last year in ${monthName} ${year} (about a year ago)`;
  } else if (monthsAgo >= 2) {
    relativeTimeDescription = `Earlier this year in ${monthName} (${monthsAgo} months ago)`;
  } else if (diffDays >= 7) {
    relativeTimeDescription = `A few weeks ago in ${monthName}`;
  } else if (diffDays >= 2) {
    relativeTimeDescription = `${diffDays} days ago`;
  } else if (diffDays === 1) {
    relativeTimeDescription = `Yesterday`;
  } else {
    relativeTimeDescription = `Recent moment`;
  }

  let era = '';
  if (year < 1990) era = `${year}s retro era`;
  else if (year < 2000) era = '90s vintage era';
  else if (year < 2010) era = '2000s throwback era';
  else if (year < 2020) era = `${year} (2010s throwback)`;
  else era = `${year} (contemporary era)`;

  const formattedDate = d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    dateStr: dateInput,
    formattedDate,
    year,
    monthName,
    season,
    timeOfDay,
    yearsAgo,
    monthsAgo,
    relativeTimeDescription,
    era,
    isThrowback: yearsAgo >= 1,
    isVintage: yearsAgo >= 15,
  };
}

function buildTimeAwarePrompt(params: {
  temporal?: TemporalContext | null;
  tone?: string;
  context?: string;
  groupName?: string;
}): string {
  const { temporal, tone = 'warm', context, groupName } = params;

  let timeContextBlock = '';
  if (temporal) {
    timeContextBlock = `
CRITICAL MEMORY TIME & ERA DETAILS:
- Exact Date Taken: ${temporal.formattedDate}
- Year & Era: ${temporal.era}
- Time Elapsed: ${temporal.relativeTimeDescription} (${temporal.yearsAgo} year(s) ago)
- Season & Atmosphere: ${temporal.season}${temporal.timeOfDay ? ` (${temporal.timeOfDay})` : ''}

CHRONOLOGICAL INSTRUCTION:
${
  temporal.yearsAgo >= 1
    ? `This memory happened in the past (${temporal.year}, approx ${temporal.yearsAgo} year(s) ago). You MUST tailor captions to this timeline: incorporate genuine nostalgia, reminiscing, the warmth of the year/era (e.g., "Back in ${temporal.year}...", "Can't believe it's been ${temporal.yearsAgo} years...", "Summer of '${String(temporal.year).slice(-2)}...", or reflecting on how time flies). DO NOT speak as though this happened today or yesterday!`
    : `This is a recent memory. Write with fresh in-the-moment presence, current seasonal atmosphere, and lively immediacy.`
}`;
  } else {
    timeContextBlock = `CRITICAL NOTE: Analyze visual clues in the photo for season, lighting, time of day (morning light, sunset golden hour, night glow), and era aesthetics.`;
  }

  return `You are a perceptive, authentic memory curator and storyteller for a private family and close friends photo vault called Nest.
Analyze this photo carefully—examine the people, expressions, setting, scenery, lighting, and specifically its temporal era.

${timeContextBlock}
${groupName ? `- Family / Circle Context: "${groupName}"` : ''}
${context ? `- User's Notes/Draft: "${context}"` : ''}
- Preferred Tone: ${tone}

GUIDELINES FOR COMPELLING CAPTIONS:
1. Ground the caption in the actual era and time: Mention the year, season, or throwback perspective naturally when appropriate.
2. Observe real visual specifics: Notice the lighting (e.g. golden hour, dim candlelight, bright midday sun), the setting, spontaneous laughter, food, or expressions.
3. Be authentic and conversational: Sound like a beloved family member or close friend writing in a cherished scrapbook, NOT a corporate marketer or generic social media influencer.
4. Absolutely avoid AI clichés: Never use "in a world where...", "frozen in time", "a testament to...", or "unforgettable moments".

Respond ONLY with valid JSON in this exact structure:
{
  "caption": "The best recommended time-aware primary caption",
  "temporalSummary": "${temporal ? temporal.relativeTimeDescription : ''}",
  "suggestions": [
    {
      "tone": "Nostalgic & Time-Honored",
      "text": "A warm caption honoring the specific year, date, season, or throwback feeling"
    },
    {
      "tone": "Fun & Witty",
      "text": "A lighthearted, witty observation about the moment, fashion, or personalities"
    },
    {
      "tone": "Short & Minimal",
      "text": "A clean 3-6 word aesthetic caption (e.g., '${temporal ? `${temporal.season} '${String(temporal.year).slice(-2)}` : 'Golden hour glow'}')"
    }
  ],
  "tags": ["#Tag1", "#Tag2", "#Tag3"]
}`;
}

// Smart heuristic fallback if AI rate limit or 503 occurs
function getHeuristicCaptions(
  tone?: string,
  context?: string,
  temporal?: TemporalContext | null
): { caption: string; suggestions: Array<{ tone: string; text: string }>; tags: string[]; temporalSummary: string } {
  const currentHour = new Date().getHours();
  const timeOfDay = currentHour < 12 ? 'morning' : currentHour < 17 ? 'afternoon' : 'golden hour';
  const month = temporal ? temporal.monthName : new Date().toLocaleString('default', { month: 'long' });
  const year = temporal ? temporal.year : new Date().getFullYear();
  const shortYear = String(year).slice(-2);

  let warm = '';
  let witty = '';
  let minimalist = '';

  if (temporal && temporal.yearsAgo >= 1) {
    // Past memory / Throwback
    warm = context
      ? `Throwback to ${temporal.monthName} ${year}: ${context} — moments that still bring a smile.`
      : temporal.yearsAgo >= 10
      ? `A treasured memory from ${year} (${temporal.yearsAgo} years ago) that still feels close to the heart.`
      : `Looking back at ${temporal.monthName} ${year} — time truly flies, but the joy remains.`;

    witty = `Throwback to ${year}: proof that we've been making memories (and questionable style choices) for ${temporal.yearsAgo} years.`;
    minimalist = `${temporal.monthName} '${shortYear} stillness.`;
  } else {
    // Recent memory
    warm = context
      ? `Cherishing this ${temporal ? temporal.season.toLowerCase() : timeOfDay} moment: ${context}.`
      : `Pure warmth and genuine smiles during this beautiful ${temporal ? temporal.season.toLowerCase() : timeOfDay}.`;

    witty = `Proof that the best memories aren't planned, they just happen.`;
    minimalist = `${month} stillness.`;
  }

  const chosen = tone === 'witty' ? witty : tone === 'short' ? minimalist : warm;

  const defaultTags = ['#Nest', '#Memories'];
  if (temporal) {
    defaultTags.push(`#${temporal.year}`, `#Throwback${temporal.isThrowback ? temporal.year : ''}`);
    if (temporal.season) defaultTags.push(`#${temporal.season.replace(/[^a-zA-Z]/g, '')}`);
  }

  return {
    caption: chosen,
    temporalSummary: temporal ? temporal.relativeTimeDescription : '',
    suggestions: [
      { tone: 'Nostalgic & Time-Honored', text: warm },
      { tone: 'Fun & Witty', text: witty },
      { tone: 'Short & Minimal', text: minimalist },
    ],
    tags: Array.from(new Set(defaultTags)),
  };
}

// Generate captions from image data or storage key
aiRouter.post('/generate-caption', upload.single('image'), async (req: AuthenticatedRequest, res) => {
  try {
    const { storageKey, imageBase64, tone = 'warm', context, takenAt, groupName } = req.body;
    let localFilePath = req.file?.path;

    const temporal = formatTemporalContext(takenAt);
    const imgData = await getImageBase64(storageKey, localFilePath, imageBase64);

    if (!imgData) {
      // Return heuristic response if image not provided
      const fallback = getHeuristicCaptions(tone, context, temporal);
      return res.json({ success: true, ...fallback, source: 'heuristic' });
    }

    // Call Gemini API with @google/genai using time-aware prompt
    const prompt = buildTimeAwarePrompt({ temporal, tone, context, groupName });

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
        const fallback = getHeuristicCaptions(tone, context, temporal);
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
        temporalSummary: parsed.temporalSummary || temporal?.relativeTimeDescription || '',
        temporal,
        source: 'gemini',
      });
    } catch (parseErr) {
      // If output was raw text instead of JSON
      const firstLine = textOutput.split('\n')[0].replace(/^["']|["']$/g, '').trim();
      return res.json({
        success: true,
        caption: firstLine || 'Cherished memory together.',
        suggestions: [
          { tone: 'Nostalgic & Time-Honored', text: firstLine },
          { tone: 'Short & Minimal', text: firstLine.slice(0, 45) },
        ],
        tags: ['#Nest', '#Memories', ...(temporal ? [`#${temporal.year}`] : [])],
        temporalSummary: temporal?.relativeTimeDescription || '',
        temporal,
        source: 'gemini_raw',
      });
    }
  } catch (error: any) {
    console.error('Caption generation error:', error);
    const temporal = formatTemporalContext(req.body?.takenAt);
    const fallback = getHeuristicCaptions(req.body?.tone, req.body?.context, temporal);
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

    // Retrieve group/circle name if shared to a group
    const groupRow = queryOne<any>(
      `SELECT g.name FROM item_groups ig JOIN groups g ON ig.group_id = g.id WHERE ig.item_type = 'post' AND ig.item_id = ? LIMIT 1`,
      [postId]
    );
    const groupName = groupRow?.name;

    // Build rich temporal context using post.taken_at
    const temporal = formatTemporalContext(post.taken_at);

    const imgData = await getImageBase64(firstFile.storage_key);
    let result: any;

    if (imgData) {
      const ai = new GoogleGenAI();
      const prompt = buildTimeAwarePrompt({
        temporal,
        tone,
        context: post.caption || undefined,
        groupName,
      });

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
        result = getHeuristicCaptions(tone, post.caption, temporal);
      }
    } else {
      result = getHeuristicCaptions(tone, post.caption, temporal);
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
      temporalSummary: result.temporalSummary || temporal?.relativeTimeDescription || '',
      temporal,
      message: 'Caption generated successfully',
    });
  } catch (err: any) {
    console.error('Caption post error:', err);
    res.status(500).json({ error: err.message || 'Failed to auto-caption memory' });
  }
});
