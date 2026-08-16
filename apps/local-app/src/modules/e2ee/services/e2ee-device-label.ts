import { ValidationError } from '../../../common/errors/error-types';

const MAX_DEVICE_LABEL_LENGTH = 120;

export function normalizeDeviceLabel(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ValidationError('label must be a string');

  const label = value.trim();
  if (label.length > MAX_DEVICE_LABEL_LENGTH) {
    throw new ValidationError(`label must be at most ${MAX_DEVICE_LABEL_LENGTH} characters`);
  }
  return label || undefined;
}
