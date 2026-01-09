import { SetMetadata } from '@nestjs/common';

export const CACHE_TTL_KEY = 'cache_ttl';
export const CACHE_NAMESPACE_KEY = 'cache_namespace';
export const CACHE_KEY_KEY = 'cache_key';

/**
 * Decorator to cache method results
 * 
 * @param ttlSeconds Time to live in seconds (default: 900 = 15 minutes)
 * @param namespace Cache namespace (default: 'default')
 * @param key Custom cache key (default: auto-generated from method name and args)
 */
export const Cacheable = (
  ttlSeconds: number = 900,
  namespace: string = 'default',
  key?: string,
) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    SetMetadata(CACHE_TTL_KEY, ttlSeconds)(target, propertyKey, descriptor);
    SetMetadata(CACHE_NAMESPACE_KEY, namespace)(target, propertyKey, descriptor);
    if (key) {
      SetMetadata(CACHE_KEY_KEY, key)(target, propertyKey, descriptor);
    }
  };
};
