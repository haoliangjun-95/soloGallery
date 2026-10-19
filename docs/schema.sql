-- soloGallery MySQL 表结构（标准化 DDL，共 8 表 + 5 外键）
--
-- 唯一事实源是 prisma/schema.prisma，本文件由它生成，用于：
--   · 本地/新环境手动初始化（mysql < docs/schema.sql）
--   · DBA 审计、跨工具建库参考
-- 日常首选仍是 `npx prisma db push`（幂等、自动跟 schema 同步）；
-- schema 变更后请重新生成本文件，勿手改：
--   npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script
--
-- 管理员账号不在本文件内：画廊首次启动后用 ADMIN_USERNAME/ADMIN_PASSWORD 登录后台即可。

CREATE DATABASE IF NOT EXISTS `sologallery` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `sologallery`;

-- CreateTable
CREATE TABLE `AdminUser` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(64) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AdminUser_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `key` VARCHAR(64) NOT NULL,
    `value` VARCHAR(512) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(128) NOT NULL,
    `slug` VARCHAR(128) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `coverPhotoId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Category_name_key`(`name`),
    UNIQUE INDEX `Category_slug_key`(`slug`),
    UNIQUE INDEX `Category_coverPhotoId_key`(`coverPhotoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tag` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(64) NOT NULL,

    UNIQUE INDEX `Tag_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Photo` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sha1` VARCHAR(40) NOT NULL,
    `source` ENUM('SYNC', 'UPLOAD') NOT NULL DEFAULT 'SYNC',
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `fileName` VARCHAR(255) NOT NULL,
    `storageKey` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(64) NOT NULL,
    `format` VARCHAR(16) NOT NULL,
    `fileSize` BIGINT NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `thumbKey` VARCHAR(255) NULL,
    `gridReady` BOOLEAN NOT NULL DEFAULT false,
    `dhash` CHAR(16) NULL,
    `categoryId` INTEGER NULL,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `missing` BOOLEAN NOT NULL DEFAULT false,
    `favorite` BOOLEAN NOT NULL DEFAULT false,
    `shotAt` DATETIME(3) NULL,
    `exif` JSON NULL,
    `wallpaperSnapshot` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Photo_sha1_key`(`sha1`),
    INDEX `Photo_published_createdAt_idx`(`published`, `createdAt`),
    INDEX `Photo_published_shotAt_idx`(`published`, `shotAt`),
    INDEX `Photo_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PhotoTag` (
    `photoId` INTEGER NOT NULL,
    `tagId` INTEGER NOT NULL,

    INDEX `PhotoTag_tagId_idx`(`tagId`),
    PRIMARY KEY (`photoId`, `tagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Comment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `photoId` INTEGER NOT NULL,
    `nickname` VARCHAR(64) NOT NULL,
    `email` VARCHAR(255) NULL,
    `content` TEXT NOT NULL,
    `adminReply` TEXT NULL,
    `adminReplyAt` DATETIME(3) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'SPAM') NOT NULL DEFAULT 'PENDING',
    `readAt` DATETIME(3) NULL,
    `ip` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Comment_photoId_status_idx`(`photoId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncRun` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `status` ENUM('RUNNING', 'DONE', 'ERROR') NOT NULL,
    `trigger` VARCHAR(16) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `newCount` INTEGER NOT NULL DEFAULT 0,
    `updatedCount` INTEGER NOT NULL DEFAULT 0,
    `missingCount` INTEGER NOT NULL DEFAULT 0,
    `skippedCount` INTEGER NOT NULL DEFAULT 0,
    `processed` INTEGER NOT NULL DEFAULT 0,
    `total` INTEGER NOT NULL DEFAULT 0,
    `error` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Category` ADD CONSTRAINT `Category_coverPhotoId_fkey` FOREIGN KEY (`coverPhotoId`) REFERENCES `Photo`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Photo` ADD CONSTRAINT `Photo_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PhotoTag` ADD CONSTRAINT `PhotoTag_photoId_fkey` FOREIGN KEY (`photoId`) REFERENCES `Photo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PhotoTag` ADD CONSTRAINT `PhotoTag_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `Tag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Comment` ADD CONSTRAINT `Comment_photoId_fkey` FOREIGN KEY (`photoId`) REFERENCES `Photo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

