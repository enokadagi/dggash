import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ChangeUserPasswordDto } from './dto/change-user-password.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (staff management)' })
  @ApiResponse({ status: 200, description: 'Users listed' })
  async findAll(@Query() query: QueryUserDto) {
    return this.usersService.findAll(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a staff user' })
  @ApiResponse({ status: 201, description: 'User created' })
  async create(@Body() dto: CreateUserDto, @CurrentUser('id') actorId: string) {
    return this.usersService.create(dto, actorId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'User updated' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.usersService.update(id, dto, actorId);
  }

  @Post(':id/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset a user password' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Password updated' })
  async changeUserPassword(
    @Param('id') id: string,
    @Body() dto: ChangeUserPasswordDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.usersService.changeUserPassword(id, dto, actorId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate user (soft delete)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'User deactivated' })
  async remove(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.usersService.remove(id, actorId);
  }
}