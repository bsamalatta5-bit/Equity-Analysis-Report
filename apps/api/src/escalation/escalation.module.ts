import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { EscalationController } from "./escalation.controller";
import { EscalationService } from "./escalation.service";

@Module({
  imports: [AuditModule],
  controllers: [EscalationController],
  providers: [EscalationService],
  exports: [EscalationService],
})
export class EscalationModule {}
