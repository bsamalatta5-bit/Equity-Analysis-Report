import type { Request } from "express";
import type { Principal } from "@voice-receptionist/shared";

export interface RequestWithPrincipal extends Request {
  principal?: Principal;
  correlationId?: string;
}
