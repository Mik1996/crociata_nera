import { z } from 'zod';
import { filterParams, MAX_TABLE_LIMIT, TableDefinition } from '@/lib/table/table-query';
import { FieldDoc, RequestPart } from './operation';

/**
 * Documentation of the query string of a table ({@link TableDefinition}): paging, sort and one
 * entry per filter parameter, from the labels of the columns. `extra` documents the parameters a
 * route adds to the table's (`schema` is then the extended schema).
 */
export function tableQueryPart<T>(
  table: TableDefinition<T>,
  rows: string,
  extra?: { schema: z.ZodObject; fields: Record<string, FieldDoc> },
): RequestPart {
  const sortable = Object.entries(table.columns)
    .filter(([, column]) => column.sort)
    .map(([id]) => `\`${id}\``);
  const fields: Record<string, FieldDoc> = {
    page: 'Page, from 1 (default 1).',
    limit: `${rows} per page, 1–${MAX_TABLE_LIMIT}; left out, every row is returned.`,
    sort: `Column to sort by: ${sortable.join(', ')} (default \`${table.sort}\`). Texts sort alphabetically ignoring case and accents; empty values come last.`,
    order: `Sort direction, \`asc\` or \`desc\` (default \`${table.order}\`).`,
  };
  for (const [id, column] of Object.entries(table.columns)) {
    if (!column.filter) continue;
    const [first, second] = filterParams(id, column.filter);
    switch (column.filter) {
      case 'text':
        fields[first!] = `Text contained in ${column.label} (case and accents ignored).`;
        break;
      case 'number':
        fields[first!] = { description: `Lowest ${column.label} (included).`, example: 1 };
        fields[second!] = `Highest ${column.label} (included).`;
        break;
      case 'date':
        fields[first!] = {
          description: `${capitalize(column.label)} at or after this instant (ISO 8601 with offset).`,
          example: '2026-11-01T00:00:00+01:00',
        };
        fields[second!] = `${capitalize(column.label)} before this instant (ISO 8601 with offset).`;
        break;
      case 'boolean':
        fields[first!] = `\`true\` or \`false\`: ${column.label}.`;
        break;
      case 'select':
        fields[first!] = column.options
          ? {
              description: `${capitalize(column.label)}: any of these values, comma-separated: ${column.options.map((o) => `\`${o}\``).join(', ')}.`,
              example: column.options.slice(0, 2).join(','),
            }
          : `${capitalize(column.label)}: any of these values, comma-separated.`;
        break;
    }
  }
  return { schema: extra?.schema ?? table.schema, fields: { ...fields, ...extra?.fields } } as RequestPart;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Fields of a page of a table: rows, matches, page and size. */
export function tablePageShape<S extends z.ZodType>(row: S, rowsDescription: string) {
  return {
    items: z.array(row).describe(rowsDescription),
    total: z.number().int().min(0).describe('Rows matching the filters, on every page.'),
    page: z.number().int().min(1).describe('Page returned, from 1.'),
    limit: z.number().int().min(1).nullable().describe('Most rows per page; `null` when every row is returned.'),
  };
}
