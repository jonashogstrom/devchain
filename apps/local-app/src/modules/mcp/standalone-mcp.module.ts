import { Module } from '@nestjs/common';
import { McpService } from './services/mcp.service';
import { McpServerService } from './services/mcp-server.service';
import { McpGateway } from './gateways/mcp.gateway';
import { StorageModule } from '../storage/storage.module';
import { McpHttpController } from './controllers/mcp-http.controller';
import { McpSdkController } from './controllers/mcp-sdk.controller';
import { McpToolBindingRegistry } from './services/mcp-tool-binding.registry';

@Module({
  imports: [StorageModule],
  controllers: [McpHttpController, McpSdkController],
  providers: [McpToolBindingRegistry, McpService, McpServerService, McpGateway],
  exports: [McpService],
})
export class StandaloneMcpModule {}
