import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'SUPABASE_CLIENT',
      useFactory: (configService: ConfigService): SupabaseClient => {
        const supabaseUrl = configService.get<string>('SUPABASE_URL');
        const supabaseKey = configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

        // Enhanced error message for debugging
        if (!supabaseUrl || !supabaseKey) {
          const missingVars: string[] = [];
          if (!supabaseUrl) missingVars.push('SUPABASE_URL');
          if (!supabaseKey) missingVars.push('SUPABASE_SERVICE_ROLE_KEY');
          
          const errorMsg = `Missing Supabase configuration: ${missingVars.join(', ')}. ` +
            `Please ensure these environment variables are set. ` +
            `Check your .env file or Docker environment configuration.`;
          
          console.error('❌ Configuration Error:', errorMsg);
          console.error('📋 Available env vars starting with SUPABASE:', 
            Object.keys(process.env).filter(k => k.startsWith('SUPABASE')));
          console.error('📋 NODE_ENV:', process.env.NODE_ENV);
          console.error('📋 Current working directory:', process.cwd());
          
          throw new Error(errorMsg);
        }

        console.log('✅ Supabase configuration loaded successfully');
        return createClient(supabaseUrl, supabaseKey);
      },
      inject: [ConfigService],
    },
  ],
  exports: ['SUPABASE_CLIENT'],
})
export class DatabaseModule {}








