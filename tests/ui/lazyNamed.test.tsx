import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { lazyNamed } from '../../src/lib/lazyNamed.tsx';

const Hello: React.FC<{ name: string }> = ({ name }) => <p>Hello {name}</p>;

describe('lazyNamed', () => {
  it('renders a lazily loaded named export with its props', async () => {
    const Lazy = lazyNamed(async () => ({ Hello }), 'Hello');
    render(<Lazy name="Nest" />);
    expect(await screen.findByText('Hello Nest')).toBeTruthy();
  });
});
