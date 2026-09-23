import {
  Controller,
  Get,
  Query,
  Res,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { ExportService } from './export.service';
import { QueryReportDto } from './dto/query-report.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly exportService: ExportService,
  ) {}

  @Get('revenue')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Generate revenue report' })
  @ApiResponse({ status: 200, description: 'Revenue report generated' })
  async getRevenueReport(@Query() query: QueryReportDto) {
    return this.reportsService.getRevenueReport(query);
  }

  @Get('sales')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Generate sales report' })
  @ApiResponse({ status: 200, description: 'Sales report generated' })
  async getSalesReport(@Query() query: QueryReportDto) {
    return this.reportsService.getSalesReport(query);
  }

  @Get('customers')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Generate customers report' })
  @ApiResponse({ status: 200, description: 'Customers report generated' })
  async getCustomersReport(@Query() query: QueryReportDto) {
    return this.reportsService.getCustomersReport(query);
  }

  @Get('subscriptions')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Generate subscriptions report' })
  @ApiResponse({ status: 200, description: 'Subscriptions report generated' })
  async getSubscriptionsReport(@Query() query: QueryReportDto) {
    return this.reportsService.getSubscriptionsReport(query);
  }

  @Get('inventory')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Generate inventory report' })
  @ApiResponse({ status: 200, description: 'Inventory report generated' })
  async getInventoryReport(@Query() query: QueryReportDto) {
    return this.reportsService.getInventoryReport(query);
  }

  @Get('stock-movements')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Generate stock movements report' })
  @ApiResponse({ status: 200, description: 'Stock movements report generated' })
  async getStockMovementsReport(@Query() query: QueryReportDto) {
    return this.reportsService.getStockMovementsReport(query);
  }

  @Get('whatsapp')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Generate WhatsApp delivery report' })
  @ApiResponse({ status: 200, description: 'WhatsApp report generated' })
  async getWhatsAppReport(@Query() query: QueryReportDto) {
    return this.reportsService.getWhatsAppReport(query);
  }

  @Get('revenue/download')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Download revenue report' })
  @ApiQuery({ name: 'format', required: false, enum: ['pdf', 'excel', 'csv'] })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async downloadRevenueReport(@Query() query: QueryReportDto, @Res() res: Response) {
    const data = await this.reportsService.getRevenueReport(query);
    await this.sendReport(res, 'revenue', data, query.format);
  }

  @Get('sales/download')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Download sales report' })
  @ApiQuery({ name: 'format', required: false, enum: ['pdf', 'excel', 'csv'] })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async downloadSalesReport(@Query() query: QueryReportDto, @Res() res: Response) {
    const data = await this.reportsService.getSalesReport(query);
    await this.sendReport(res, 'sales', data, query.format);
  }

  @Get('customers/download')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Download customers report' })
  @ApiQuery({ name: 'format', required: false, enum: ['pdf', 'excel', 'csv'] })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async downloadCustomersReport(@Query() query: QueryReportDto, @Res() res: Response) {
    const data = await this.reportsService.getCustomersReport(query);
    await this.sendReport(res, 'customers', data, query.format);
  }

  @Get('subscriptions/download')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Download subscriptions report' })
  @ApiQuery({ name: 'format', required: false, enum: ['pdf', 'excel', 'csv'] })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async downloadSubscriptionsReport(@Query() query: QueryReportDto, @Res() res: Response) {
    const data = await this.reportsService.getSubscriptionsReport(query);
    await this.sendReport(res, 'subscriptions', data, query.format);
  }

  @Get('inventory/download')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Download inventory report' })
  @ApiQuery({ name: 'format', required: false, enum: ['pdf', 'excel', 'csv'] })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async downloadInventoryReport(@Query() query: QueryReportDto, @Res() res: Response) {
    const data = await this.reportsService.getInventoryReport(query);
    await this.sendReport(res, 'inventory', data, query.format);
  }

  @Get('stock-movements/download')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Download stock movements report' })
  @ApiQuery({ name: 'format', required: false, enum: ['pdf', 'excel', 'csv'] })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async downloadStockMovementsReport(@Query() query: QueryReportDto, @Res() res: Response) {
    const data = await this.reportsService.getStockMovementsReport(query);
    await this.sendReport(res, 'stock-movements', data, query.format);
  }

  @Get('whatsapp/download')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Download WhatsApp report' })
  @ApiQuery({ name: 'format', required: false, enum: ['pdf', 'excel', 'csv'] })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  async downloadWhatsAppReport(@Query() query: QueryReportDto, @Res() res: Response) {
    const data = await this.reportsService.getWhatsAppReport(query);
    await this.sendReport(res, 'whatsapp', data, query.format);
  }

  private async sendReport(res: Response, reportType: string, data: any, format?: string) {
    const safeFormat = format || 'pdf';
    const safeReportType = reportType.toLowerCase();

    try {
      switch (safeFormat) {
        case 'pdf': {
          const buffer = await this.exportService.generatePdfReport(safeReportType, data);
          res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${safeReportType}-report.pdf"`,
          });
          res.send(buffer);
          break;
        }
        case 'excel': {
          const buffer = await this.exportService.generateExcelReport(safeReportType, data);
          res.set({
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${safeReportType}-report.xlsx"`,
          });
          res.send(buffer);
          break;
        }
        case 'csv': {
          const csv = await this.exportService.generateCsvReport(safeReportType, data);
          res.set({
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${safeReportType}-report.csv"`,
          });
          res.send(csv);
          break;
        }
        default:
          throw new BadRequestException(`Unsupported format: ${safeFormat}. Use pdf, excel, or csv.`);
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Failed to generate report');
    }
  }
}