/**
 * Test layer: pure unit.
 * Zod and TypeScript contract validation needs no dependency injection or I/O, so this is the
 * cheapest reliable layer that proves the subscriber DTO shapes.
 */
import { ZodError } from 'zod';
import type { EventFilterGroup as DomainEventFilterGroup } from '../../storage/models/domain.models';
import type { EventFilterGroup as UiEventFilterGroup } from '../../../ui/lib/subscribers';
import {
  ActionInputSchema,
  EventFilterSchema,
  CreateSubscriberSchema,
  UpdateSubscriberSchema,
  type EventFilterGroup as DtoEventFilterGroup,
} from './subscriber.dto';

describe('Subscriber DTO schemas', () => {
  const validUuid = '00000000-0000-0000-0000-000000000000';

  describe('ActionInputSchema', () => {
    it('validates event_field source with eventField', () => {
      expect(() =>
        ActionInputSchema.parse({
          source: 'event_field',
          eventField: 'sessionId',
        }),
      ).not.toThrow();
    });

    it('validates custom source with customValue', () => {
      expect(() =>
        ActionInputSchema.parse({
          source: 'custom',
          customValue: '/compact',
        }),
      ).not.toThrow();
    });

    it('allows empty string for customValue', () => {
      expect(() =>
        ActionInputSchema.parse({
          source: 'custom',
          customValue: '',
        }),
      ).not.toThrow();
    });

    it('rejects event_field source without eventField', () => {
      expect(() =>
        ActionInputSchema.parse({
          source: 'event_field',
        }),
      ).toThrow(ZodError);
    });

    it('rejects custom source without customValue', () => {
      expect(() =>
        ActionInputSchema.parse({
          source: 'custom',
        }),
      ).toThrow(ZodError);
    });

    it('rejects invalid source', () => {
      expect(() =>
        ActionInputSchema.parse({
          source: 'invalid',
          customValue: 'test',
        }),
      ).toThrow(ZodError);
    });
  });

  describe('EventFilterSchema', () => {
    it('requires one or more conditions in every TypeScript group contract', () => {
      type Condition = { field: string; operator: 'equals'; value: string };
      type EmptyGroup = { combinator: 'and'; filters: [] };
      type OneConditionGroup = { combinator: 'and'; filters: [Condition] };
      type IsAssignable<Source, Target> = Source extends Target ? true : false;

      const assertions: [
        IsAssignable<EmptyGroup, DomainEventFilterGroup>,
        IsAssignable<EmptyGroup, UiEventFilterGroup>,
        IsAssignable<EmptyGroup, DtoEventFilterGroup>,
        IsAssignable<OneConditionGroup, DomainEventFilterGroup>,
        IsAssignable<OneConditionGroup, UiEventFilterGroup>,
        IsAssignable<OneConditionGroup, DtoEventFilterGroup>,
      ] = [false, false, false, true, true, true];

      expect(assertions).toEqual([false, false, false, true, true, true]);
    });

    it('validates valid filter', () => {
      expect(() =>
        EventFilterSchema.parse({
          field: 'agentName',
          operator: 'equals',
          value: 'Coder',
        }),
      ).not.toThrow();
    });

    it.each([
      { operator: 'equals', value: 'value' },
      { operator: 'contains', value: 'value' },
      { operator: 'regex', value: '^value$' },
      { operator: 'is_null', value: '' },
      { operator: 'is_not_null', value: '' },
    ] as const)(
      'validates and preserves the $operator operator/value pair',
      ({ operator, value }) => {
        expect(
          EventFilterSchema.parse({
            field: 'test',
            operator,
            value,
          }),
        ).toEqual({ field: 'test', operator, value });
      },
    );

    it('requires a string value for null-aware operators', () => {
      expect(
        EventFilterSchema.safeParse({
          field: 'parentId',
          operator: 'is_not_null',
          value: null,
        }).success,
      ).toBe(false);
    });

    it.each(['and', 'or'] as const)('validates a non-empty %s filter group', (combinator) => {
      expect(() =>
        EventFilterSchema.parse({
          combinator,
          filters: [
            { field: 'agentName', operator: 'equals', value: 'Coder' },
            { field: 'message', operator: 'contains', value: '' },
          ],
        }),
      ).not.toThrow();
    });

    it('rejects an empty filter group', () => {
      expect(() =>
        EventFilterSchema.parse({
          combinator: 'and',
          filters: [],
        }),
      ).toThrow(ZodError);
    });

    it('rejects nested filter groups', () => {
      expect(() =>
        EventFilterSchema.parse({
          combinator: 'or',
          filters: [
            {
              combinator: 'and',
              filters: [{ field: 'agentName', operator: 'equals', value: 'Coder' }],
            },
          ],
        }),
      ).toThrow(ZodError);
    });

    it('accepts null value', () => {
      expect(() => EventFilterSchema.parse(null)).not.toThrow();
    });

    it('rejects empty field', () => {
      expect(() =>
        EventFilterSchema.parse({
          field: '',
          operator: 'equals',
          value: 'test',
        }),
      ).toThrow(ZodError);
    });

    it('rejects invalid operator', () => {
      expect(() =>
        EventFilterSchema.parse({
          field: 'test',
          operator: 'invalid',
          value: 'test',
        }),
      ).toThrow(ZodError);
    });
  });

  describe('CreateSubscriberSchema', () => {
    const minValidData = {
      projectId: validUuid,
      name: 'My Subscriber',
      eventName: 'claude.context_full',
      actionType: 'SendAgentMessage',
      actionInputs: {
        text: { source: 'custom' as const, customValue: '/compact' },
      },
    };

    it('validates minimal valid data with defaults', () => {
      const result = CreateSubscriberSchema.parse(minValidData);
      expect(result.projectId).toBe(validUuid);
      expect(result.name).toBe('My Subscriber');
      expect(result.enabled).toBe(true);
      expect(result.delayMs).toBe(0);
      expect(result.cooldownMs).toBe(5000);
      expect(result.retryOnError).toBe(false);
    });

    it('validates full data with all fields', () => {
      const fullData = {
        projectId: validUuid,
        name: 'Full Subscriber',
        description: 'A test subscriber',
        enabled: false,
        eventName: 'claude.context_full',
        eventFilter: {
          field: 'agentName',
          operator: 'equals' as const,
          value: 'Coder',
        },
        actionType: 'SendAgentMessage',
        actionInputs: {
          text: { source: 'custom' as const, customValue: '/compact' },
          sessionId: { source: 'event_field' as const, eventField: 'sessionId' },
        },
        delayMs: 1000,
        cooldownMs: 30000,
        retryOnError: true,
      };
      expect(() => CreateSubscriberSchema.parse(fullData)).not.toThrow();
    });

    it('rejects missing required fields', () => {
      expect(() => CreateSubscriberSchema.parse({})).toThrow(ZodError);
      expect(() => CreateSubscriberSchema.parse({ projectId: validUuid })).toThrow(ZodError);
    });

    it('rejects invalid projectId', () => {
      expect(() =>
        CreateSubscriberSchema.parse({
          ...minValidData,
          projectId: 'not-a-uuid',
        }),
      ).toThrow(ZodError);
    });

    it('rejects name exceeding 100 chars', () => {
      expect(() =>
        CreateSubscriberSchema.parse({
          ...minValidData,
          name: 'a'.repeat(101),
        }),
      ).toThrow(ZodError);
    });

    it('rejects empty name', () => {
      expect(() =>
        CreateSubscriberSchema.parse({
          ...minValidData,
          name: '',
        }),
      ).toThrow(ZodError);
    });

    it('rejects actionType exceeding 50 chars', () => {
      expect(() =>
        CreateSubscriberSchema.parse({
          ...minValidData,
          actionType: 'a'.repeat(51),
        }),
      ).toThrow(ZodError);
    });

    it('rejects delayMs outside range', () => {
      expect(() =>
        CreateSubscriberSchema.parse({
          ...minValidData,
          delayMs: -1,
        }),
      ).toThrow(ZodError);

      expect(() =>
        CreateSubscriberSchema.parse({
          ...minValidData,
          delayMs: 30001,
        }),
      ).toThrow(ZodError);
    });

    it('rejects cooldownMs outside range', () => {
      expect(() =>
        CreateSubscriberSchema.parse({
          ...minValidData,
          cooldownMs: -1,
        }),
      ).toThrow(ZodError);

      expect(() =>
        CreateSubscriberSchema.parse({
          ...minValidData,
          cooldownMs: 60001,
        }),
      ).toThrow(ZodError);
    });

    it('validates actionInputs with multiple entries', () => {
      expect(() =>
        CreateSubscriberSchema.parse({
          ...minValidData,
          actionInputs: {
            text: { source: 'custom', customValue: '/compact' },
            delay: { source: 'custom', customValue: '100' },
            target: { source: 'event_field', eventField: 'agentId' },
          },
        }),
      ).not.toThrow();
    });

    it('validates empty actionInputs', () => {
      expect(() =>
        CreateSubscriberSchema.parse({
          ...minValidData,
          actionInputs: {},
        }),
      ).not.toThrow();
    });

    it('rejects invalid actionInputs entry', () => {
      expect(() =>
        CreateSubscriberSchema.parse({
          ...minValidData,
          actionInputs: {
            text: { source: 'event_field' }, // missing eventField
          },
        }),
      ).toThrow(ZodError);
    });

    it('allows null eventFilter', () => {
      expect(() =>
        CreateSubscriberSchema.parse({
          ...minValidData,
          eventFilter: null,
        }),
      ).not.toThrow();
    });
  });

  describe('UpdateSubscriberSchema', () => {
    it('allows empty object (no updates)', () => {
      expect(() => UpdateSubscriberSchema.parse({})).not.toThrow();
    });

    it('validates partial updates', () => {
      expect(() =>
        UpdateSubscriberSchema.parse({
          name: 'Updated Name',
        }),
      ).not.toThrow();

      expect(() =>
        UpdateSubscriberSchema.parse({
          enabled: false,
          cooldownMs: 10000,
        }),
      ).not.toThrow();
    });

    it('allows nullable description', () => {
      expect(() =>
        UpdateSubscriberSchema.parse({
          description: null,
        }),
      ).not.toThrow();

      expect(() =>
        UpdateSubscriberSchema.parse({
          description: 'New description',
        }),
      ).not.toThrow();
    });

    it('does not apply defaults', () => {
      const result = UpdateSubscriberSchema.parse({});
      expect(result.enabled).toBeUndefined();
      expect(result.delayMs).toBeUndefined();
      expect(result.cooldownMs).toBeUndefined();
      expect(result.retryOnError).toBeUndefined();
    });

    it('still validates field constraints', () => {
      expect(() =>
        UpdateSubscriberSchema.parse({
          name: '',
        }),
      ).toThrow(ZodError);

      expect(() =>
        UpdateSubscriberSchema.parse({
          delayMs: -1,
        }),
      ).toThrow(ZodError);

      expect(() =>
        UpdateSubscriberSchema.parse({
          actionType: '',
        }),
      ).toThrow(ZodError);
    });

    it('validates actionInputs when provided', () => {
      expect(() =>
        UpdateSubscriberSchema.parse({
          actionInputs: {
            text: { source: 'custom', customValue: 'test' },
          },
        }),
      ).not.toThrow();

      expect(() =>
        UpdateSubscriberSchema.parse({
          actionInputs: {
            text: { source: 'custom' }, // missing customValue
          },
        }),
      ).toThrow(ZodError);
    });

    it('validates eventFilter when provided', () => {
      expect(() =>
        UpdateSubscriberSchema.parse({
          eventFilter: {
            field: 'test',
            operator: 'equals',
            value: 'value',
          },
        }),
      ).not.toThrow();

      expect(() =>
        UpdateSubscriberSchema.parse({
          eventFilter: null,
        }),
      ).not.toThrow();
    });
  });
});
