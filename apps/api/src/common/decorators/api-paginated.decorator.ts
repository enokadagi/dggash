import { applyDecorators, Type } from '@nestjs/common';
import { ApiOkResponse, ApiQuery, getSchemaPath } from '@nestjs/swagger';

export function ApiPaginatedResponse<TModel extends Type<any>>(model: TModel) {
  return applyDecorators(
    ApiOkResponse({
      schema: {
        allOf: [
          {
            properties: {
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              },
              meta: {
                type: 'object',
                properties: {
                  total: { type: 'number' },
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  totalPages: { type: 'number' },
                  hasNext: { type: 'boolean' },
                  hasPrev: { type: 'boolean' },
                },
              },
            },
          },
        ],
      },
    }),
  );
}
