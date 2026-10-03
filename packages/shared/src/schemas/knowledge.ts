import { z } from "zod";
import { KNOWLEDGE_LANGUAGE } from "../constants/enums";

export const createKnowledgeItemRequestSchema = z.object({
  questionText: z.string().min(1).max(500),
  answerText: z.string().min(1).max(4000),
  language: z.enum(KNOWLEDGE_LANGUAGE),
  active: z.boolean().default(true),
});
export type CreateKnowledgeItemRequest = z.infer<typeof createKnowledgeItemRequestSchema>;

export const updateKnowledgeItemRequestSchema = createKnowledgeItemRequestSchema.partial();
export type UpdateKnowledgeItemRequest = z.infer<typeof updateKnowledgeItemRequestSchema>;
