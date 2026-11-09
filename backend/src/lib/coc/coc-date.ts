import { z } from 'zod';

/** Date of the Clash of Clans API: `20261030T070000.000Z` -> Date (ISO 8601 accepted too). */
export const cocDate = z.string().transform((value, ctx) => {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(value);
  const date = m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: 'custom', message: `Invalid date: ${value}` });
    return z.NEVER;
  }
  return date;
});
