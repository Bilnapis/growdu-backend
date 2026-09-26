import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Periksa status Growdu Backend' })
  @ApiOkResponse({
    description: 'Backend sedang berjalan.',
    schema: {
      example: {
        service: 'growdu-backend',
        status: 'ok',
      },
    },
  })
  getHealth(): { service: string; status: string } {
    return this.appService.getHealth();
  }
}
