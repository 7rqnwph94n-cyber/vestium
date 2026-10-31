import { z } from 'zod';

export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationParams = z.infer<typeof PaginationSchema>;
