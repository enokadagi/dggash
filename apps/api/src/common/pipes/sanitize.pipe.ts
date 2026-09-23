import { PipeTransform, Injectable } from '@nestjs/common';

@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: any): any {
    if (typeof value === 'string') {
      return value
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/javascript:/gi, '');
    }
    if (typeof value === 'object' && value !== null) {
      const sanitized: any = Array.isArray(value) ? [] : {};
      for (const [key, val] of Object.entries(value)) {
        sanitized[key] = this.transform(val);
      }
      return sanitized;
    }
    return value;
  }
}
