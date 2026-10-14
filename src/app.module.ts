import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaService } from './prisma/prisma.service';
import { EmpleadoModule } from './empleado/empleado.module';
import { RolModule } from './rol/rol.module';
import { ClienteModule } from './cliente/cliente.module';
import { MarcaModule } from './marca/marca.module';
import { ArticuloModule } from './articulo/articulo.module';
import { AlicuotaIvaModule } from './alicuotaIva/alicuotaIva.module';
import { PermisoModule } from './permiso/permiso.module';
import { PedidoModule } from './pedido/pedido.module';


@Module({
  imports: [AuthModule, EmpleadoModule, RolModule, ClienteModule, MarcaModule, ArticuloModule, AlicuotaIvaModule, PermisoModule, PedidoModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}