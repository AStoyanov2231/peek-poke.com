export function profileInterestDeleteFilter(identifier: string) {
  return `id.eq.${identifier},tag_id.eq.${identifier}`;
}
