import { z } from 'zod';
export const customerCreate = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional()
});
