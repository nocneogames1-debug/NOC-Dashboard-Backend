import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';

import { AlertsGateway } from './alerts.gateway';

import { OpsgenieService } from './opsgenie/opsgenie.service';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertTag, AlertTagSchema } from './schemas/alerttag.schema';
import { OpsgenieController } from './opsgenie/opsgenie.controller';

@Module({
    imports: [
        HttpModule,              // 👈 provides HttpService
        ScheduleModule.forRoot(),
        MongooseModule.forFeature([{ name: AlertTag.name, schema: AlertTagSchema }]),// only if you really use @Cron / @Interval / @Timeout
    ],
    controllers: [OpsgenieController],
    providers: [AlertsGateway, OpsgenieService],
    exports: [OpsgenieService, AlertsGateway], // 👈 export if other modules need them
})
export class AlertsModule { }
