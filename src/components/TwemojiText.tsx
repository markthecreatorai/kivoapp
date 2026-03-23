import { replaceEmojisWithTwemoji } from '@/lib/twemoji';
import { useMemo } from 'react';

interface TwemojiTextProps {
  text: string;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}

/**
 * Renders text with native emoji characters replaced by Twemoji SVGs.
 */
export function TwemojiText({ text, className, as: Tag = 'span' }: TwemojiTextProps) {
  const html = useMemo(() => replaceEmojisWithTwemoji(text), [text]);
  
  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
