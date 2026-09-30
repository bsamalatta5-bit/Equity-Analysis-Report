import { Module } from "@nestjs/common";
import { CallsController, RecordingsController } from "./calls.controller";
import { CallsService } from "./calls.service";

@Module({
  controllers: [CallsController, RecordingsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
