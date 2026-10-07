import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CategoryDto, CreateUserDto, EventSettingsDto, ExhibitorFormDto, GeofenceDto } from '../src/admin/admin.dto';
import { CastVoteDto } from '../src/visitor/visitor.dto';
import { CatalogService } from '../src/admin/catalog.service';

describe('create and edit field validation', () => {
  it.each([-1, 1.5, '1', '', 'text', null, NaN, Infinity, 2147483648])('rejects invalid category order %s in the API and both save paths', async (sort_order) => {
    const body = { name: 'Award', sort_order };
    expect(validateSync(plainToInstance(CategoryDto, body)).length).toBeGreaterThan(0);
    const ds = { query: jest.fn() };
    const service = new CatalogService(ds as any, {} as any, {} as any);
    await expect(service.createCategory('admin', '127.0.0.1', body as any)).rejects.toMatchObject({ response: { error: 'bad_order' } });
    await expect(service.updateCategory('admin', '127.0.0.1', 1, body as any)).rejects.toMatchObject({ response: { error: 'bad_order' } });
    expect(ds.query).not.toHaveBeenCalled();
  });

  it.each([undefined, 0, 1, 2147483647])('accepts valid category order %s', (sort_order) => {
    expect(validateSync(plainToInstance(CategoryDto, { name: 'Award 2026', sort_order }))).toHaveLength(0);
  });

  it.each([
    [CategoryDto, { name: 123 }],
    [CategoryDto, { name: '   ' }],
    [EventSettingsDto, { name: ' ' }],
    [EventSettingsDto, { name: 123 }],
    [ExhibitorFormDto, { name: 'Maker', is_active: 'text' }],
    [ExhibitorFormDto, { name: 'Maker', remove_photo: '1' }],
    [CreateUserDto, { username: 'ab', password: 'longpassword' }],
    [CreateUserDto, { username: 'user', password: 'short' }],
    [CastVoteDto, { categoryId: -1, exhibitorId: 1 }],
    [CastVoteDto, { categoryId: 1, exhibitorId: '2' }],
    [CastVoteDto, { categoryId: 1, exhibitorId: 2147483648 }],
    [GeofenceDto, { lat: 0, lng: 0, radius_m: -10 }],
    [GeofenceDto, { lat: '0', lng: 0, radius_m: 100 }],
    [GeofenceDto, { lat: 0, lng: 0, radius_m: 100, max_accuracy_m: -1 }],
  ])('rejects mismatched types and invalid field limits %#', (Dto, body) => {
    expect(validateSync(plainToInstance(Dto as any, body) as object).length).toBeGreaterThan(0);
  });

  it('allows negative coordinates, zero accuracy and digits in text labels', () => {
    expect(validateSync(plainToInstance(GeofenceDto, { lat: -31.5, lng: -35.5, radius_m: 100, max_accuracy_m: 0 }))).toHaveLength(0);
    expect(validateSync(plainToInstance(ExhibitorFormDto, { name: 'Team 42', booth: 'B4', project: '2026', is_active: 'false' }))).toHaveLength(0);
  });
});
