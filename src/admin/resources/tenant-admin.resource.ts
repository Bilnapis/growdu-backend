import {
  BaseProperty,
  BaseRecord,
  BaseResource,
  Filter,
  ValidationError,
} from 'adminjs';
import {
  Between,
  DataSource,
  FindOptionsOrder,
  FindOptionsWhere,
  In,
  LessThanOrEqual,
  Like,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { TenantEntity } from '../../tenants/entities/tenant.entity.js';

type TenantPropertyPath = keyof TenantEntity;
type TenantParams = Record<string, string | Date | null>;

type TenantPropertyDefinition = {
  path: TenantPropertyPath;
  type: ConstructorParameters<typeof BaseProperty>[0]['type'];
  isId?: boolean;
  position: number;
};

const TENANT_PROPERTIES: TenantPropertyDefinition[] = [
  { path: 'id', type: 'uuid', isId: true, position: 0 },
  { path: 'ownerId', type: 'uuid', position: 1 },
  { path: 'name', type: 'string', position: 2 },
  { path: 'address', type: 'textarea', position: 3 },
  { path: 'whatsappNumber', type: 'phone', position: 4 },
  { path: 'email', type: 'string', position: 5 },
  { path: 'logoUrl', type: 'string', position: 6 },
  { path: 'status', type: 'string', position: 7 },
  { path: 'createdAt', type: 'datetime', position: 8 },
  { path: 'updatedAt', type: 'datetime', position: 9 },
];

export class TenantAdminResource extends BaseResource {
  private readonly repository: Repository<TenantEntity>;
  private readonly resourceProperties: BaseProperty[];

  constructor(dataSource: DataSource) {
    super(TenantEntity);
    this.repository = dataSource.getRepository(TenantEntity);
    this.resourceProperties = TENANT_PROPERTIES.map(
      ({ path, type, isId, position }) =>
        new BaseProperty({
          path,
          type,
          isId,
          isSortable: true,
          position,
        }),
    );
  }

  static override isAdapterFor(resource: unknown): boolean {
    return resource === TenantEntity;
  }

  override databaseName(): string {
    return 'growdu';
  }

  override databaseType(): string {
    return 'mysql';
  }

  override id(): string {
    return 'Tenant';
  }

  override properties(): BaseProperty[] {
    return this.resourceProperties;
  }

  override property(path: string): BaseProperty | null {
    return (
      this.resourceProperties.find((resourceProperty) => {
        return resourceProperty.path() === path;
      }) ?? null
    );
  }

  override async count(filter: Filter): Promise<number> {
    return this.repository.count({ where: this.toWhere(filter) });
  }

  override async find(
    filter: Filter,
    options: {
      limit?: number;
      offset?: number;
      sort?: {
        sortBy?: string;
        direction?: 'asc' | 'desc';
      };
    },
  ): Promise<BaseRecord[]> {
    const records = await this.repository.find({
      where: this.toWhere(filter),
      take: options.limit ?? 10,
      skip: options.offset ?? 0,
      order: this.toOrder(options.sort),
    });

    return records.map((record) => new BaseRecord(this.toParams(record), this));
  }

  override async findOne(id: string): Promise<BaseRecord | null> {
    const record = await this.repository.findOne({ where: { id } });
    return record ? new BaseRecord(this.toParams(record), this) : null;
  }

  override async findMany(ids: Array<string | number>): Promise<BaseRecord[]> {
    const records = await this.repository.find({
      where: { id: In(ids.map(String)) },
    });

    return records.map((record) => new BaseRecord(this.toParams(record), this));
  }

  override build(params: Record<string, unknown>): BaseRecord {
    return new BaseRecord(this.prepareParams(params), this);
  }

  override async create(
    params: Record<string, unknown>,
  ): Promise<TenantParams> {
    const tenant = this.repository.create(this.prepareTenant(params, true));
    await this.validateTenant(tenant);

    return this.toParams(await this.repository.save(tenant));
  }

  override async update(
    id: string,
    params: Record<string, unknown>,
  ): Promise<TenantParams> {
    const tenant = await this.repository.findOne({ where: { id } });

    if (!tenant) {
      throw new ValidationError(
        {},
        {
          message: 'Tenant not found',
        },
      );
    }

    Object.assign(tenant, this.prepareTenant(params, false));
    await this.validateTenant(tenant);

    return this.toParams(await this.repository.save(tenant));
  }

  override async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  private toOrder(
    sort:
      | {
          sortBy?: string;
          direction?: 'asc' | 'desc';
        }
      | undefined,
  ): FindOptionsOrder<TenantEntity> {
    const sortBy = sort?.sortBy;
    if (!sortBy || !this.isTenantProperty(sortBy)) {
      return { createdAt: 'DESC' };
    }

    return {
      [sortBy]: sort?.direction?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
    };
  }

  private toWhere(filter: Filter): FindOptionsWhere<TenantEntity> {
    return filter.reduce<FindOptionsWhere<TenantEntity>>((where, element) => {
      const { path, value } = element;

      if (!this.isTenantProperty(path)) {
        return where;
      }

      if (path === 'createdAt' || path === 'updatedAt') {
        return {
          ...where,
          [path]: this.toDateFilter(value),
        };
      }

      if (path === 'status') {
        return {
          ...where,
          status:
            value === EntityStatus.Inactive
              ? EntityStatus.Inactive
              : EntityStatus.Active,
        };
      }

      if (typeof value === 'string' && value.trim()) {
        return {
          ...where,
          [path]: Like(`%${value.trim()}%`),
        };
      }

      return where;
    }, {});
  }

  private toDateFilter(value: string | { from: string; to: string }) {
    if (typeof value === 'string') {
      return new Date(value);
    }

    if (value.from && value.to) {
      return Between(new Date(value.from), new Date(value.to));
    }

    if (value.from) {
      return MoreThanOrEqual(new Date(value.from));
    }

    if (value.to) {
      return LessThanOrEqual(new Date(value.to));
    }

    return undefined;
  }

  private prepareTenant(
    params: Record<string, unknown>,
    includeMissingProperties: boolean,
  ): Partial<TenantEntity> {
    const tenant: Partial<TenantEntity> = {};

    if (includeMissingProperties || Object.hasOwn(params, 'name')) {
      tenant.name = this.toNullableString(params.name) ?? '';
    }

    if (includeMissingProperties || Object.hasOwn(params, 'ownerId')) {
      tenant.ownerId = this.toNullableString(params.ownerId) ?? '';
    }

    if (includeMissingProperties || Object.hasOwn(params, 'address')) {
      tenant.address = this.toNullableString(params.address);
    }

    if (includeMissingProperties || Object.hasOwn(params, 'whatsappNumber')) {
      tenant.whatsappNumber = this.toNullableString(params.whatsappNumber);
    }

    if (includeMissingProperties || Object.hasOwn(params, 'email')) {
      tenant.email = this.toNullableString(params.email);
    }

    if (includeMissingProperties || Object.hasOwn(params, 'logoUrl')) {
      tenant.logoUrl = this.toNullableString(params.logoUrl);
    }

    if (includeMissingProperties || Object.hasOwn(params, 'status')) {
      tenant.status =
        params.status === EntityStatus.Inactive
          ? EntityStatus.Inactive
          : EntityStatus.Active;
    }

    return tenant;
  }

  private prepareParams(params: Record<string, unknown>): TenantParams {
    return {
      id: this.toNullableString(params.id),
      ownerId: this.toNullableString(params.ownerId),
      name: this.toNullableString(params.name),
      address: this.toNullableString(params.address),
      whatsappNumber: this.toNullableString(params.whatsappNumber),
      email: this.toNullableString(params.email),
      logoUrl: this.toNullableString(params.logoUrl),
      status:
        params.status === EntityStatus.Inactive
          ? EntityStatus.Inactive
          : EntityStatus.Active,
      createdAt: this.toDate(params.createdAt),
      updatedAt: this.toDate(params.updatedAt),
    };
  }

  private async validateTenant(tenant: TenantEntity): Promise<void> {
    if (!tenant.name.trim()) {
      throw new ValidationError({
        name: {
          type: 'required',
          message: 'Name is required',
        },
      });
    }
  }

  private toParams(tenant: TenantEntity): TenantParams {
    return {
      id: tenant.id,
      ownerId: tenant.ownerId,
      name: tenant.name,
      address: tenant.address,
      whatsappNumber: tenant.whatsappNumber,
      email: tenant.email,
      logoUrl: tenant.logoUrl,
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  private isTenantProperty(path: string): path is TenantPropertyPath {
    return TENANT_PROPERTIES.some((property) => property.path === path);
  }

  private toNullableString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private toDate(value: unknown): Date | null {
    if (value instanceof Date) {
      return value;
    }

    return typeof value === 'string' && value ? new Date(value) : null;
  }
}
