import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AlertsGateway } from '../alerts.gateway';
import { Cron } from '@nestjs/schedule';
import * as https from 'https';
import { InjectModel } from '@nestjs/mongoose';
import { AlertTag, AlertTagDocument } from '../schemas/alerttag.schema';
import { Model } from 'mongoose';

@Injectable()
export class OpsgenieService {
    private readonly logger = new Logger(OpsgenieService.name);

    // נשתמש ב-agent אחד לכל הבקשות
    private readonly httpsAgent = new https.Agent({
        rejectUnauthorized: false, // 
    });

    constructor(
        private readonly http: HttpService,
        private readonly alertsGateway: AlertsGateway,
        @InjectModel(AlertTag.name) private readonly alertTagModel: Model<AlertTagDocument>,
    ) { }

    async getAlerts() {
        this.logger.log('Fetching alerts from Opsgenie...');

        try {
            const response = await firstValueFrom(
                this.http.get(process.env.OPSGENIE_API_URL as string, {
                    headers: {
                        Authorization: `GenieKey ${process.env.OPSGENIE_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    httpsAgent: this.httpsAgent, // 👈 כאן העוקף
                    params: {
                        query: process.env.OPSGENIE_ALERTS_QUERY,
                    },
                }),
            );

            const alerts = response.data?.data ?? [];
            this.logger.log(`Retrieved ${alerts.length} alerts from Opsgenie`);
            return alerts;
        } catch (error: any) {
            if (error.response) {
                this.logger.error(
                    `Failed to fetch alerts from Opsgenie: ${error.response.status} ${error.response.statusText}`,
                );
                this.logger.error(
                    `Opsgenie response data: ${JSON.stringify(error.response.data)}`,
                );
            } else {
                this.logger.error('Failed to fetch alerts from Opsgenie', error.stack);
            }
            return [];
        }
    }

    async pollAndBroadcastAlerts(): Promise<void> {
        this.logger.log('Starting pollAndBroadcastAlerts...');

        const alerts = await this.getAlerts();

        for (const alert of alerts) {
            try {
                await this.alertsGateway.broadcastAlert(alert);
                this.logger.log(`Broadcasted alert ID: ${alert || 'unknown'}`);
                // for (const tag of alert.tags || []) {

                //     await this.createAlertTag(alert.id, tag,);
                // }
            } catch (error) {
                this.logger.error(
                    `Failed to broadcast alert ID: ${alert.id || 'unknown'}`,
                    error.stack,
                );
            }
        }

        this.logger.log('Completed pollAndBroadcastAlerts');
    }

    // runs every 30 seconds
    @Cron('*/30 * * * * *')
    async handleCron() {
        this.logger.log('Cron job triggered: fetching and broadcasting alerts');
        await this.pollAndBroadcastAlerts();
    }


    async createAlertTag(alertId: string, title: string): Promise<void> {
        let metric, env = false;
        this.logger.log(`Creating tag for alert ID: ${alertId} with title: ${title}`);

        try {
            const newTag = new this.alertTagModel({ title, env, metric });
            await newTag.save();
            this.logger.log(`Successfully created tag for alert ID: ${alertId}`);
        } catch (error) {
            this.logger.error(`Failed to create tag for alert ID: ${alertId}`, error.stack);
        }
    }

    async getAlertById(alertId: string) {
        this.logger.log(`Fetching alert details for ID: ${alertId}`);

        try {
            // Construct the URL: OPSGENIE_API_URL usually ends in /v2/alerts
            const url = `${process.env.OPSGENIE_API_URL}/${alertId}`;

            const response = await firstValueFrom(
                this.http.get(url, {
                    headers: {
                        Authorization: `GenieKey ${process.env.OPSGENIE_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    httpsAgent: this.httpsAgent,
                    params: {
                        identifierType: 'id', // Explicitly state we are using the ID
                    },
                }),
            );

            const alertData = response.data?.data;
            this.logger.log(`Successfully retrieved details for alert ID: ${alertId}`);
            return alertData;

        } catch (error: any) {
            if (error.response) {
                this.logger.error(
                    `Failed to fetch alert ${alertId}: ${error.response.status} ${error.response.statusText}`,
                );
                this.logger.error(
                    `Opsgenie response data: ${JSON.stringify(error.response.data)}`,
                );
            } else {
                this.logger.error(`Failed to fetch alert ${alertId}`, error.stack);
            }
            return null;
        }
    }
}
