import { MODULE_METADATA } from '@nestjs/common/constants';
import { ProjectCommunicationModule } from '../project-communication/project-communication.module';
import { McpFullModule } from './mcp-full.module';

describe('McpFullModule', () => {
  it('imports the real project communication provider module', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, McpFullModule) as unknown[];

    expect(imports).toContain(ProjectCommunicationModule);
    expect(
      imports.map((module) => {
        if (typeof module === 'function') return module.name;
        if (
          module &&
          typeof module === 'object' &&
          'forwardRef' in module &&
          typeof module.forwardRef === 'function'
        ) {
          const resolved = module.forwardRef();
          return typeof resolved === 'function' ? resolved.name : undefined;
        }
        return undefined;
      }),
    ).not.toContain('ChatModule');
  });
});
