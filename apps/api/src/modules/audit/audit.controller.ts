import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('audit')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log entries' })
  @ApiResponse({ status: 200, description: 'Audit entries listed' })
  async findAll(@Query() query: QueryAuditDto) {
    return this.auditService.list(query);
  }
}