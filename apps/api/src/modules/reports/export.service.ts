import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  async generatePdfReport(reportType: string, data: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      doc.fontSize(20).font('Helvetica-Bold').text('AWIK NET', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').text('Internet Service Provider', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica-Bold').text(this.getReportTitle(reportType), { align: 'center' });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.8);

      const { headers, rows, summary } = this.getReportData(reportType, data);

      if (summary) {
        doc.font('Helvetica-Bold').fontSize(10).text(summary.join('  |  '));
        doc.moveDown(0.8);
      }

      this.renderPdfTable(doc, headers, rows);

      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).font('Helvetica').text(
          `Generated on ${new Date().toLocaleDateString()} | Page ${i + 1} of ${pageCount}`,
          50,
          doc.page.height - 35,
          { align: 'center', width: 495 },
        );
      }

      doc.end();
    });
  }

  async generateExcelReport(reportType: string, data: any): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AWIK NET';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(this.getReportTitle(reportType));

    const headerFill: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    const headerFont: any = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    const borderStyle: Partial<ExcelJS.Borders> = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };

    const { headers, rows, summary } = this.getReportData(reportType, data);

    sheet.mergeCells(1, 1, 1, headers.length);
    const titleCell = sheet.getCell('A1');
    titleCell.value = `AWIK NET - ${this.getReportTitle(reportType)}`;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center' };

    sheet.mergeCells(2, 1, 2, headers.length);
    const dateCell = sheet.getCell('A2');
    dateCell.value = `Generated: ${new Date().toLocaleDateString()}`;
    dateCell.alignment = { horizontal: 'center' };

    const headerRow = sheet.addRow(headers);
    headerRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.border = borderStyle;
    });

    if (rows.length === 0) {
      sheet.addRow(['No data available']);
    } else {
      rows.forEach((row) => {
        const dataRow = sheet.addRow(row);
        dataRow.eachCell((cell) => { cell.border = borderStyle; });
      });
    }

    if (summary) {
      sheet.addRow([]);
      const summaryRow = sheet.addRow(['', 'Summary:', ...summary]);
      summaryRow.eachCell((cell) => { cell.font = { bold: true }; });
    }

    sheet.columns.forEach((col) => {
      col.width = Math.max(15, col.header?.toString().length || 15);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async generateCsvReport(reportType: string, data: any): Promise<string> {
    const { headers, rows } = this.getReportData(reportType, data);
    const csvRows: string[] = [headers.join(',')];
    rows.forEach((row) => {
      csvRows.push(row.map((cell: any) => `"${String(cell || '').replace(/"/g, '""')}"`).join(','));
    });
    return csvRows.join('\n');
  }

  private getReportTitle(type: string): string {
    const titles: Record<string, string> = {
      revenue: 'Revenue Report',
      sales: 'Sales Report',
      customers: 'Customers Report',
      subscriptions: 'Subscriptions Report',
      inventory: 'Inventory Report',
      ['stock-movements']: 'Stock Movements Report',
      whatsapp: 'WhatsApp Report',
    };
    return titles[type] || 'Report';
  }

  private customerName(customer: any): string {
    return customer
      ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Walk-in'
      : 'Walk-in';
  }

  private getReportData(type: string, data: any): { headers: string[]; rows: any[][]; summary?: any[] } {
    switch (type) {
      case 'revenue':
        return {
          headers: ['Sale #', 'Customer', 'Method', 'Amount', 'Date'],
          rows: (data.sales || []).map((s: any) => [
            s.saleNumber || 'N/A',
            this.customerName(s.customer),
            s.paymentMethod || 'N/A',
            Number(s.totalAmount || 0).toFixed(2),
            s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'N/A',
          ]),
          summary: [
            `Total Revenue: ${(data.summary?.totalRevenue || 0).toFixed(2)}`,
            `Total Sales: ${data.summary?.totalSales || 0}`,
            ...((data.byMethod || []).map(
              (m: any) => `${m.method}: ${Number(m.total).toFixed(2)} (${m.count})`,
            )),
          ],
        };
      case 'sales':
        return {
          headers: ['Sale #', 'Customer', 'Method', 'Status', 'Amount', 'Date'],
          rows: (data.sales || []).map((s: any) => [
            s.saleNumber || 'N/A',
            this.customerName(s.customer),
            s.paymentMethod || 'N/A',
            s.status || 'N/A',
            Number(s.totalAmount || 0).toFixed(2),
            s.createdAt ? new Date(s.createdAt).toLocaleDateString() : 'N/A',
          ]),
          summary: [
            `Total Amount: ${(data.summary?.totalAmount || 0).toFixed(2)}`,
            `Total Count: ${data.summary?.totalCount || 0}`,
            ...((data.byStatus || []).map((s: any) => `${s.status}: ${s.count}`)),
          ],
        };
      case 'customers':
        return {
          headers: ['Name', 'Phone', 'WhatsApp', 'Status', 'Joined'],
          rows: (data.recentCustomers || []).map((c: any) => [
            `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'N/A',
            c.phone || 'N/A',
            c.whatsappNumber || '-',
            c.status || 'N/A',
            c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'N/A',
          ]),
          summary: [
            `Total Customers: ${data.summary?.totalCustomers || 0}`,
            `With WhatsApp: ${data.summary?.withWhatsapp || 0}`,
            ...((data.byStatus || []).map((s: any) => `${s.status}: ${s.count}`)),
          ],
        };
      case 'subscriptions':
        return {
          headers: ['Status', 'Count'],
          rows: (data.byStatus || []).map((s: any) => [s.status, s.count]),
          summary: [
            `Total Subscriptions: ${data.summary?.totalSubscriptions || 0}`,
            `Active: ${data.summary?.totalActive || 0}`,
          ],
        };
      case 'inventory':
        return {
          headers: ['Category', 'Item Count', 'Total Stock', 'Value'],
          rows: (data.byCategory || []).map((c: any) => [
            c.category,
            c.count,
            c.totalStock,
            Number(c.value || 0).toFixed(2),
          ]),
          summary: [
            `Total Items: ${data.summary?.totalItems || 0}`,
            `Total Quantity: ${data.summary?.totalQuantity || 0}`,
            `Total Value: ${(data.summary?.totalValue || 0).toFixed(2)}`,
          ],
        };
      case 'stock-movements':
        return {
          headers: ['Product', 'Type', 'Quantity', 'Prev', 'New', 'User', 'Date'],
          rows: (data.movements || []).map((m: any) => [
            m.product?.name || 'N/A',
            m.movementType || 'N/A',
            String(m.quantity ?? 'N/A'),
            String(m.previousStock ?? 'N/A'),
            String(m.newStock ?? 'N/A'),
            m.user ? `${m.user.firstName} ${m.user.lastName}`.trim() : 'System',
            m.createdAt ? new Date(m.createdAt).toLocaleDateString() : 'N/A',
          ]),
          summary: [
            `Total Movements: ${data.summary?.totalMovements || 0}`,
            `Inbound: ${data.summary?.inbound || 0}`,
            `Outbound: ${data.summary?.outbound || 0}`,
          ],
        };
      case 'whatsapp':
        return {
          headers: ['Phone', 'Status', 'Template', 'Date'],
          rows: (data.messages || []).map((m: any) => [
            m.recipientPhone || 'N/A',
            m.status || 'N/A',
            m.templateType || '-',
            m.createdAt ? new Date(m.createdAt).toLocaleDateString() : 'N/A',
          ]),
          summary: [
            `Total: ${data.summary?.totalMessages || 0}`,
            `Delivered: ${data.summary?.delivered || 0}`,
            `Failed: ${data.summary?.failed || 0}`,
            `Rate: ${data.summary?.deliveryRate == null ? '-' : `${(data.summary.deliveryRate * 100).toFixed(1)}%`}`,
          ],
        };
      default:
        return { headers: ['Data'], rows: [['No data available']] };
    }
  }

  private renderPdfTable(
    doc: PDFKit.PDFDocument,
    headers: string[],
    rows: any[][],
    startX = 50,
  ) {
    if (rows.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(10).text('No data available', startX);
      doc.moveDown(1);
      return;
    }

    const colCount = headers.length;
    const pageWidth = doc.page.width - 100;
    const colWidth = pageWidth / colCount;
    const rowHeight = 20;

    const headerY = doc.y;
    doc.rect(startX, headerY, pageWidth, rowHeight).fill('#1E40AF');
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
    headers.forEach((h, i) => {
      doc.text(h, startX + i * colWidth + 4, headerY + 5, {
        width: colWidth - 8,
        lineBreak: false,
      });
    });

    doc.y = headerY + rowHeight;

    doc.fillColor('#000000').font('Helvetica').fontSize(8);
    rows.forEach((row, rowIdx) => {
      const y = doc.y;
      if (y + rowHeight > doc.page.height - 80) {
        doc.addPage();
      }
      const currentY = doc.y;
      const bgColor = rowIdx % 2 === 0 ? '#F3F4F6' : '#FFFFFF';
      doc.rect(startX, currentY, pageWidth, rowHeight).fill(bgColor);
      doc.fillColor('#000000').font('Helvetica').fontSize(8);

      row.forEach((cell, i) => {
        doc.text(String(cell ?? 'N/A'), startX + i * colWidth + 4, currentY + 5, {
          width: colWidth - 8,
          lineBreak: false,
        });
      });

      doc.y = currentY + rowHeight;
    });

    doc.strokeColor('#D1D5DB').lineWidth(0.5);
    doc.rect(startX, headerY, pageWidth, rowHeight + rows.length * rowHeight).stroke();
    doc.moveDown(1);
  }
}