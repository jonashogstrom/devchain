import type { SQL } from 'drizzle-orm';
import {
  and as andSync,
  eq as eqSync,
  isNull as isNullSync,
  ne as neSync,
  or as orSync,
} from 'drizzle-orm';
import type {
  DocumentIdentifier,
  DocumentListFilters,
  ListResult,
} from '../../interfaces/storage.interface';
import type {
  CreateDocument,
  CreateTag,
  Document,
  Tag,
  UpdateDocument,
} from '../../models/domain.models';
import { NotFoundError, ValidationError } from '../../../../common/errors/error-types';
import { createLogger } from '../../../../common/logging/logger';
import {
  documentTags as documentTagsTable,
  documents as documentsTable,
  tags as tagsTable,
} from '../../db/schema';
import { normalizeTagList, slugify } from '../helpers/storage-helpers';
import { BaseStorageDelegate, type StorageDelegateContext } from './base-storage.delegate';

const logger = createLogger('DocumentStorageDelegate');

export interface DocumentStorageDelegateDependencies {
  createTag: (data: CreateTag) => Tag;
}

export class DocumentStorageDelegate extends BaseStorageDelegate {
  constructor(
    context: StorageDelegateContext,
    private readonly dependencies: DocumentStorageDelegateDependencies,
  ) {
    super(context);
  }

  async listDocuments(filters: DocumentListFilters = {}): Promise<ListResult<Document>> {
    const { documents, documentTags, tags } = await import('../../db/schema');
    const { and, eq, isNull, like, or, desc, sql } = await import('drizzle-orm');

    const whereClauses: SQL[] = [];
    if (filters.projectId !== undefined) {
      whereClauses.push(
        filters.projectId === null
          ? isNull(documents.projectId)
          : eq(documents.projectId, filters.projectId),
      );
    }

    const tagKeys = normalizeTagList(filters.tagKeys);
    if (tagKeys.length) {
      for (const key of tagKeys) {
        whereClauses.push(
          sql`EXISTS (
            SELECT 1
            FROM ${documentTags} dt
            INNER JOIN ${tags} t ON t.id = dt.tag_id
            WHERE dt.document_id = ${documents.id}
              AND (
                (
                  CASE
                    WHEN instr(t.name, ':') > 0 THEN substr(t.name, 1, instr(t.name, ':') - 1)
                    ELSE NULL
                  END
                ) = ${key}
                OR t.name = ${key}
              )
          )`,
        );
      }
    }

    const searchTerm = filters.q?.trim();
    if (searchTerm) {
      const pattern = `%${searchTerm}%`;
      whereClauses.push(
        or(like(documents.title, pattern), like(documents.contentMd, pattern)) as SQL,
      );
    }

    const whereCondition: SQL | undefined =
      whereClauses.length === 0
        ? undefined
        : whereClauses.length === 1
          ? whereClauses[0]
          : and(...whereClauses);

    const rows = await (whereCondition
      ? this.db.select().from(documents).where(whereCondition).orderBy(desc(documents.updatedAt))
      : this.db.select().from(documents).orderBy(desc(documents.updatedAt)));
    if (!rows.length) {
      return {
        items: [],
        total: 0,
        limit: filters.limit ?? 100,
        offset: filters.offset ?? 0,
      };
    }

    const documentsWithTags = rows.map((row) => this.getDocumentSync({ id: row.id }));

    let filtered = documentsWithTags;
    if (filters.tags?.length) {
      const requiredTags = normalizeTagList(filters.tags);
      filtered = documentsWithTags.filter((doc) =>
        requiredTags.every((tag) => doc.tags.includes(tag)),
      );
    }

    const limit = filters.limit ?? 100;
    const offset = filters.offset ?? 0;
    const items = filtered.slice(offset, offset + limit);

    return {
      items,
      total: filtered.length,
      limit,
      offset,
    };
  }

  async getDocument(identifier: DocumentIdentifier): Promise<Document> {
    return this.getDocumentSync(identifier);
  }

  private getDocumentSync(identifier: DocumentIdentifier): Document {
    let whereCondition;
    if (identifier.id) {
      whereCondition = eqSync(documentsTable.id, identifier.id);
    } else if (identifier.slug) {
      if (identifier.projectId === undefined) {
        throw new ValidationError('projectId is required when querying document by slug');
      }
      whereCondition =
        identifier.projectId === null
          ? andSync(
              isNullSync(documentsTable.projectId),
              eqSync(documentsTable.slug, identifier.slug),
            )
          : andSync(
              eqSync(documentsTable.projectId, identifier.projectId),
              eqSync(documentsTable.slug, identifier.slug),
            );
    } else {
      throw new ValidationError('Document identifier requires either id or slug');
    }

    const record = this.db.select().from(documentsTable).where(whereCondition).limit(1).get();
    if (!record) {
      const lookup = identifier.id ?? `${identifier.projectId ?? 'global'}:${identifier.slug}`;
      throw new NotFoundError('Document', lookup || 'unknown');
    }

    const tagRows = this.db
      .select({ tag: tagsTable })
      .from(documentTagsTable)
      .innerJoin(tagsTable, eqSync(documentTagsTable.tagId, tagsTable.id))
      .where(eqSync(documentTagsTable.documentId, record.id))
      .all();

    return {
      ...record,
      projectId: record.projectId ?? null,
      tags: tagRows.map((row) => row.tag.name),
    } as Document;
  }

  async createDocument(data: CreateDocument): Promise<Document> {
    const { randomUUID } = await import('crypto');
    const now = new Date().toISOString();
    const normalizedProjectId = data.projectId ?? null;
    const { documents } = await import('../../db/schema');

    const slugSource = data.slug ?? data.title;
    const slug = this.generateDocumentSlugSync(normalizedProjectId, slugSource);
    const tags = normalizeTagList(data.tags);

    const id = randomUUID();
    await this.db.insert(documents).values({
      id,
      projectId: normalizedProjectId,
      title: data.title,
      slug,
      contentMd: data.contentMd,
      version: 1,
      archived: false,
      createdAt: now,
      updatedAt: now,
    });

    if (tags.length) {
      this.setDocumentTagsSync(id, tags, normalizedProjectId);
    }

    logger.info({ documentId: id }, 'Created document');
    return this.getDocumentSync({ id });
  }

  async updateDocument(id: string, data: UpdateDocument): Promise<Document> {
    const result = await this.versionedMutationExecutor.execute({
      resource: 'Document',
      id,
      expectedVersion: data.version,
      loadCurrent: () => this.getDocumentSync({ id }),
      versionOf: (current) => current.version,
      prepare: ({ current }) => {
        const updatePayload: Record<string, unknown> = {};
        if (data.title !== undefined) updatePayload.title = data.title;
        if (data.contentMd !== undefined) updatePayload.contentMd = data.contentMd;
        if (data.archived !== undefined) updatePayload.archived = data.archived;
        if (data.slug !== undefined) {
          updatePayload.slug = this.generateDocumentSlugSync(current.projectId, data.slug, id);
        }
        return {
          kind: 'write',
          state: {
            updatePayload,
            requestedTags: data.tags === undefined ? undefined : normalizeTagList(data.tags),
            now: new Date().toISOString(),
          },
        };
      },
      write: (context, state) =>
        this.db
          .update(documentsTable)
          .set({
            ...state.updatePayload,
            updatedAt: state.now,
            version: context.nextVersion,
          })
          .where(
            andSync(
              eqSync(documentsTable.id, id),
              eqSync(documentsTable.version, context.actualVersion),
            ),
          )
          .run().changes,
      afterWrite: ({ current }, state) => {
        if (state.requestedTags !== undefined) {
          this.setDocumentTagsSync(id, state.requestedTags, current.projectId);
        }
      },
      loadResult: () => this.getDocumentSync({ id }),
    });

    logger.info({ documentId: id }, 'Updated document');
    return result;
  }

  async deleteDocument(id: string): Promise<void> {
    const { documents } = await import('../../db/schema');
    const { eq } = await import('drizzle-orm');
    await this.db.delete(documents).where(eq(documents.id, id));
    logger.info({ documentId: id }, 'Deleted document');
  }

  private generateDocumentSlugSync(
    projectId: string | null,
    desired: string,
    excludeId?: string,
  ): string {
    const base = slugify(desired || 'document') || 'document';
    let candidate = base;
    let attempt = 1;

    // Attempt to find a unique slug, appending a counter if necessary
    // We guard against infinite loops by incrementing attempt on each collision
    // (Slug uniqueness is enforced per project.)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const projectCondition =
        projectId === null
          ? isNullSync(documentsTable.projectId)
          : eqSync(documentsTable.projectId, projectId);
      const slugCondition = eqSync(documentsTable.slug, candidate);
      const whereClause = excludeId
        ? andSync(slugCondition, projectCondition, neSync(documentsTable.id, excludeId))
        : andSync(slugCondition, projectCondition);

      const existing = this.db
        .select({ id: documentsTable.id })
        .from(documentsTable)
        .where(whereClause)
        .limit(1)
        .get();

      if (!existing) {
        return candidate;
      }

      attempt += 1;
      candidate = `${base}-${attempt}`;
    }
  }

  private setDocumentTagsSync(
    documentId: string,
    tagNames: string[],
    projectId: string | null,
  ): void {
    const normalizedTags = normalizeTagList(tagNames);

    this.db.delete(documentTagsTable).where(eqSync(documentTagsTable.documentId, documentId)).run();

    for (const tagName of normalizedTags) {
      const projectCondition =
        projectId === null
          ? isNullSync(tagsTable.projectId)
          : orSync(eqSync(tagsTable.projectId, projectId), isNullSync(tagsTable.projectId));

      const existing = this.db
        .select()
        .from(tagsTable)
        .where(andSync(eqSync(tagsTable.name, tagName), projectCondition))
        .limit(1)
        .get();

      const tag = existing ?? this.dependencies.createTag({ projectId, name: tagName });
      this.db.insert(documentTagsTable).values({ documentId, tagId: tag.id }).run();
    }
  }
}
