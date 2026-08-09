export interface CanonicalAgentOrderItem {
  id: string;
  name: string;
  isProjectOwner: boolean;
}

export function compareCanonicalAgents(
  left: CanonicalAgentOrderItem,
  right: CanonicalAgentOrderItem,
): number {
  if (left.isProjectOwner !== right.isProjectOwner) {
    return left.isProjectOwner ? -1 : 1;
  }

  const nameOrder = left.name.localeCompare(right.name);
  return nameOrder !== 0 ? nameOrder : left.id.localeCompare(right.id);
}
