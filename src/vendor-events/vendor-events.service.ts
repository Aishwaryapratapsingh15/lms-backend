import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorEventDto } from './dto/create-vendor-event.dto';
import { UpdateVendorEventDto } from './dto/update-vendor-event.dto';

@Injectable()
export class VendorEventsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateVendorEventDto, actorId: string) {
    return this.prisma.vendorEvent.create({
      data: {
        productName: dto.productName,
        eventDate: dto.eventDate ? new Date(dto.eventDate) : null,
        attendance: dto.attendance,
        notes: dto.notes,
        createdById: actorId,
      },
    });
  }

  list() {
    return this.prisma.vendorEvent.findMany({
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { eventDate: 'desc' },
    });
  }

  async findOne(id: string) {
    const event = await this.prisma.vendorEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Vendor event not found');
    return event;
  }

  async update(id: string, dto: UpdateVendorEventDto) {
    await this.findOne(id);
    return this.prisma.vendorEvent.update({
      where: { id },
      data: {
        ...dto,
        eventDate:
          dto.eventDate === undefined
            ? undefined
            : dto.eventDate
              ? new Date(dto.eventDate)
              : null,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.vendorEvent.delete({ where: { id } });
    return { message: 'Vendor event deleted' };
  }
}
