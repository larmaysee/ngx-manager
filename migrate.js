#!/usr/bin/env tsx

/**
 * Standalone migration CLI script
 * Usage:
 *   tsx migrate.js          - Run pending migrations
 *   tsx migrate.js --status - Show migration status
 *   tsx migrate.js --help   - Show help
 */

import { runMigrations, getMigrationStatus, testConnection } from './api/config/database.ts';
import process from 'process';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  try {
    // Test database connection first
    console.log('🔗 Testing database connection...');
    const isConnected = await testConnection();
    if (!isConnected) {
      console.error('❌ Database connection failed. Please check your configuration.');
      process.exit(1);
    }

    switch (command) {
      case '--status':
      case '-s':
        await showMigrationStatus();
        break;
      
      case '--help':
      case '-h':
        showHelp();
        break;
      
      case undefined:
        // Default: run migrations
        await runPendingMigrations();
        break;
      
      default:
        console.error(`❌ Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  }
}

async function runPendingMigrations() {
  console.log('🚀 Starting migration process...');
  await runMigrations();
  console.log('🎉 Migration process completed!');
}

async function showMigrationStatus() {
  console.log('📊 Migration Status:');
  console.log('==================');
  
  try {
    const migrations = await getMigrationStatus();
    
    if (migrations.length === 0) {
      console.log('No migrations have been executed yet.');
      return;
    }
    
    console.log('\nExecuted Migrations:');
    console.log('-------------------');
    
    migrations.forEach((migration, index) => {
      const status = migration.status === 'success' ? '✅' : '❌';
      const date = new Date(migration.executed_at).toLocaleString();
      
      console.log(`${index + 1}. ${status} ${migration.filename}`);
      console.log(`   Executed: ${date}`);
      
      if (migration.status === 'failed' && migration.error_message) {
        console.log(`   Error: ${migration.error_message}`);
      }
      
      console.log('');
    });
    
    const successCount = migrations.filter(m => m.status === 'success').length;
    const failedCount = migrations.filter(m => m.status === 'failed').length;
    
    console.log(`Summary: ${successCount} successful, ${failedCount} failed`);
  } catch (error) {
    console.error('❌ Failed to get migration status:', error);
  }
}

function showHelp() {
  console.log(`\n📚 Migration CLI Help\n`);
  console.log('Usage:');
  console.log('  tsx migrate.js          Run pending migrations');
  console.log('  tsx migrate.js --status Show migration status');
  console.log('  tsx migrate.js --help   Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  tsx migrate.js          # Run all pending migrations');
  console.log('  tsx migrate.js -s       # Show migration status (short form)');
  console.log('  tsx migrate.js --status # Show migration status (long form)');
  console.log('');
}

// Run the main function
main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});