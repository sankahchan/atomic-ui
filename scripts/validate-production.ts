import path from 'node:path';
import {
  loadEnvFile,
  validateProductionEnvironment,
} from '@/lib/services/production-validation';

function getArg(name: string): string | undefined {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : undefined;
}

const envFile = getArg('env-file') || process.env.ENV_FILE || '.env';
const envPath = path.resolve(process.cwd(), envFile);
const fileEnv = loadEnvFile(envPath);
const env = { ...fileEnv, ...process.env } as Record<string, string | undefined>;
const { errors, warnings } = validateProductionEnvironment(env);

if (errors.length > 0) {
  console.error('Production validation failed');
  for (const error of errors) {
    console.error(`ERROR: ${error}`);
  }
  for (const warning of warnings) {
    console.error(`WARN: ${warning}`);
  }
  process.exit(1);
}

console.log('Production validation passed');
for (const warning of warnings) {
  console.log(`WARN: ${warning}`);
}
