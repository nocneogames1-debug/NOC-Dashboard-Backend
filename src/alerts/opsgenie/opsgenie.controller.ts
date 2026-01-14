import { Controller, Post, Body, Headers, HttpCode, Logger } from '@nestjs/common';
import { AlertsGateway } from '../alerts.gateway';
import { OpsgenieService } from './opsgenie.service';

@Controller('opsgenie')
export class OpsgenieController {
    private readonly logger = new Logger(OpsgenieController.name);

    constructor(private readonly alertsGateway: AlertsGateway, private readonly opsgenieService: OpsgenieService) { }

    @Post('webhook')
    @HttpCode(200)
    async handleWebhook(
        @Body() body: any,
        @Headers('x-forwarded-for') ip?: string,
    ) {
        this.logger.log(`Received Opsgenie webhook from IP: ${ip ?? 'unknown'}`);
        this.logger.debug(`Payload: ${JSON.stringify(body, null, 2)}`);

        // Broadcast to WebSocket clients
        await this.alertsGateway.broadcastAlert(body);

        this.logger.log('Alert broadcasted to WebSocket clients.');

        return { status: 'ok' };
    }
    @Post('fetch-list')
    async getAlertsByList(@Body() body: { ids: string[] }) {
        const { ids } = body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return { message: 'No IDs provided', data: [] };
        }

        this.logger.log(`Received request to fetch ${ids.length} alerts.`);

        // We map over the IDs and call the service for each one
        // Promise.all allows these requests to happen in parallel (fast loop)
        const promises = ids.map(async (id) => {
            return await this.opsgenieService.getAlertById(id);
        });

        const results = await Promise.all(promises);

        // Filter out any nulls (failed requests)
        const foundAlerts = results.filter((alert) => alert !== null);

        this.logger.log(`Successfully fetched ${foundAlerts.length} alerts.`);

        return foundAlerts;
    }
}
