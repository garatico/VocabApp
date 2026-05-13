#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '../..');
const vocabAppDir = path.join(projectRoot, 'packages/vocab-practice');
const backendPublicDir = path.join(__dirname, '../public');

console.log('📦 Building vocab-practice app...');

async function copyDir(src, dest) {
  try {
    await fs.mkdir(dest, { recursive: true });
    const files = await fs.readdir(src);
    for (const file of files) {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      const stat = await fs.stat(srcPath);
      if (stat.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function build() {
  try {
    await fs.mkdir(backendPublicDir, { recursive: true });
    await copyDir(path.join(vocabAppDir, 'public'), backendPublicDir);
    console.log('✓ Copied public/');
    await copyDir(path.join(vocabAppDir, 'styles'), path.join(backendPublicDir, 'styles'));
    console.log('✓ Copied styles/');
    await copyDir(path.join(vocabAppDir, 'src'), path.join(backendPublicDir, 'src'));
    console.log('✓ Copied src/');
    console.log('\n✅ Build complete!\n');
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

build();
