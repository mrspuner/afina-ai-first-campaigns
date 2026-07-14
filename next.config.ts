import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    // Персистентный FS-кэш Turbopack dev (default on в 16.2.2) фоново компактит/
    // сериализует БД кэша и течёт по памяти воркера в простое до OOM
    // (next-swc → JS через ThreadSafeFunction). Единственная правка — отключаем его.
    // turbopackFileSystemCacheForDev касается только dev; на прод-сборку не влияет.
    turbopackFileSystemCacheForDev: false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
