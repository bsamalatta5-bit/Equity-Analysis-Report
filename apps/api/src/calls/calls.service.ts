import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  NotFoundError,
  RecordingNotFoundError,
  SignedUrlInvalidError,
  THRESHOLDS,
} from "@voice-receptionist/shared";
import {
  issueSignedRecordingToken,
  loadRecordingStorageConfig,
  retrieveAndDecryptRecording,
  verifySignedRecordingToken,
  type RecordingStorageConfig,
} from "./recording-storage";

@Injectable()
export class CallsService {
  private readonly storageConfig: RecordingStorageConfig;

  constructor() {
    this.storageConfig = loadRecordingStorageConfig();
  }

  async listCalls(tx: Prisma.TransactionClient, locationId: string) {
    return tx.call.findMany({ where: { locationId }, orderBy: { startedAt: "desc" } });
  }

  async getCallTranscript(tx: Prisma.TransactionClient, locationId: string, callId: string) {
    const call = await tx.call.findUnique({ where: { id: callId } });
    if (!call || call.locationId !== locationId) {
      throw new NotFoundError("Call", callId);
    }
    const turns = await tx.callTurn.findMany({ where: { callId }, orderBy: { sequence: "asc" } });
    return { call, turns };
  }

  /** A10.2: "issued after authorization" — this is called only from an RBAC-gated controller route. */
  async issueRecordingSignedUrl(tx: Prisma.TransactionClient, locationId: string, callId: string) {
    const call = await tx.call.findUnique({ where: { id: callId } });
    if (!call || call.locationId !== locationId) {
      throw new NotFoundError("Call", callId);
    }
    if (!call.recordingObjectKey) {
      throw new RecordingNotFoundError(callId);
    }
    const { token, expiresAt } = issueSignedRecordingToken(
      this.storageConfig,
      call.recordingObjectKey,
      THRESHOLDS.RECORDING_SIGNED_URL_TTL_SECONDS,
    );
    return { token, expiresAt };
  }

  /** The public recording-serving route's only dependency — no tenant/session context, trusts the signature alone. */
  async retrieveRecordingByToken(token: string): Promise<Buffer> {
    const verified = verifySignedRecordingToken(this.storageConfig, token);
    if (!verified) {
      throw new SignedUrlInvalidError();
    }
    return retrieveAndDecryptRecording(this.storageConfig, verified.objectKey);
  }
}
