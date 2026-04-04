-- Drop old unique indexes that limit to 1 reaction per target
DROP INDEX IF EXISTS uq_reaction_post;
DROP INDEX IF EXISTS uq_reaction_comment;

-- Recreate with emoji included — allows multiple different emojis per user per target
CREATE UNIQUE INDEX uq_reaction_post ON community_reactions (member_id, post_id, emoji) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX uq_reaction_comment ON community_reactions (member_id, comment_id, emoji) WHERE comment_id IS NOT NULL;

-- Composite indexes for fast counting by emoji
CREATE INDEX IF NOT EXISTS idx_reactions_post_emoji ON community_reactions (post_id, emoji) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reactions_comment_emoji ON community_reactions (comment_id, emoji) WHERE comment_id IS NOT NULL;