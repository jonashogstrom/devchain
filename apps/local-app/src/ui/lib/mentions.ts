interface MentionableAgent {
  id: string;
  name: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseMentions(content: string, agents: readonly MentionableAgent[]): string[] {
  const mentionedIds = new Set<string>();
  const normalizedContent = content.toLowerCase();

  for (const agent of agents) {
    const normalizedName = agent.name.trim().toLowerCase();
    if (!normalizedName) {
      continue;
    }

    const handle = `@${escapeRegExp(normalizedName)}`;
    const pattern = new RegExp(`(^|[^\\w@])${handle}(?=$|[^\\w])`);

    if (pattern.test(normalizedContent)) {
      mentionedIds.add(agent.id);
    }
  }

  return [...mentionedIds];
}
