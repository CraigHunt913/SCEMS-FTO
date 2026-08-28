/**
 * Where each of the tracker's 341 declarations belongs.
 *
 * Not a heuristic. A rule you can read, argue with, and change. Anything the
 * rules do not name lands in UNFILED and the build refuses, because a file
 * that quietly absorbs whatever it did not recognise is how this happened in
 * the first place.
 *
 * The point of the exercise: Code.gs is ordered by WHEN each thing was
 * written. Fourteen blocks labelled ADD-ON sit at the bottom, spanning six
 * versions, each one a patch appended rather than filed. advanceTraineeNow is
 * nowhere near the advancement code. The scoreboard is at line 11,633. This
 * puts every declaration next to the ones it works with.
 */

// The files, in the order they are concatenated back into Code.gs.
const FILES = [
  ['00_core',        'Shared plumbing: the spreadsheet handle, dates, logging, locks, mail budget.'],
  ['05_governance',  'Who is allowed to do what, and the gates every mutating path passes through.'],
  ['10_identity',    'Resolving a person to a role, and the roster behind it.'],
  ['20_forms',       'The nine forms: their ids, their dropdowns, their links.'],
  ['30_ingestion',   'A form response arriving, and the ledger that makes replaying one safe.'],
  ['35_operations',  'The day-to-day machinery carried forward from v19 and v20.'],
  ['40_skills',      'The skill catalogue, the evidence, the matrix, and what readiness means.'],
  ['50_decisions',   'The validation queue, the authority to decide, and the permanent sign-off log.'],
  ['60_reporting',   'Digests, scoreboards, snapshots and cards. Everything that gets read, nothing that decides.'],
  ['70_admin_health','Health checks and repairs: what is wrong, and the previewed tool that fixes it.'],
  ['75_presentation','How the sheets look and read. Three versions of this concern used to sit in three separate blocks.'],
  ['80_migration',   'One-time migrations between versions of this system.'],
  ['85_freshstart',  'Copying the tracker and cleaning the copy, without losing anything.'],
  ['87_estate',      'One live workbook, nine live forms: backup clones, orphan tabs, estate health.'],
  ['90_recovery',    'Run-once tools for when something went wrong: phantoms, lost responses, backfills.'],
  ['95_runners',     'Triggers, the menu, and the functions a human runs by name.'],
  ['99_config',      'Constants. Nothing here does anything.']
];

// Sections that already say where they belong.
const KEEP = {
  '00_core': '00_core', '05_governance': '05_governance', '10_identity': '10_identity',
  '20_forms': '20_forms', '30_ingestion': '30_ingestion', '35_operations_ported': '35_operations',
  '40_skills': '40_skills', '50_decisions': '50_decisions', '60_reporting': '60_reporting',
  '70_admin_health': '70_admin_health', '80_migration': '80_migration',
  '95_runners': '95_runners', '99_config': '99_config'
};

// Everything the ADD-ONs and unnamed blocks hold, by name.
const BY_NAME = {};
const put = (file, names) => names.forEach(n => { BY_NAME[n] = file; });

put('95_runners', ['START_HERE', 'FINISH_TRACKER', 'MAKE_IT_PROFESSIONAL', 'MAKE_IT_SIMPLE',
  'ELITE_ESTATE', 'ELITE_ESTATE_FINISH', 'archiveFormCopiesPrompt', 'applyEngineRepairPrompt',
  'POLISH_SHEETS', 'SIMPLIFY_EVERYTHING', 'FIX_MY_SHEETS', 'goLiveChecklistV20_2',
  'deploymentStatusV20_2', 'deploymentPreflight', 'traineeList', 'getList', 'engineRows',
  'MANAGED_TRIGGER_HANDLERS']);

put('60_reporting', ['traineeStatusCards', 'supervisorDigest', 'systemHeartbeat', 'monthlySnapshot',
  'ftoScoreboardV20_1', 'redoAuditTabV20_1', 'traineeListSafeV20_1_', 'collectActionItemsV19_',
  'statusMeta_', 'traineeCard_', 'rollupCardV19_', 'snapshotFactsV19_', 'progressLineV19_',
  'viewOverviewV19_', 'viewActivityV19_', 'viewSkillsByPhaseV19_', 'viewSkillsCompletedV19_',
  'viewSkillsRemainingV19_', 'signaturesOnFileV19_', 'latestFocusV19_', 'latestStrengthV19_',
  'shiftProgressV19_', 'traineeEventsV19_', 'traineeSkillsV19_', 'tvBandV19_', 'tvTableV19_',
  'handoverCardBodyV19_']);

put('00_core', ['MAIL_ALERT_RESERVE_V20_2', 'mailBudgetOkV20_2_', 'reportBulkTruncationV20_2_',
  'parseDateV19_', 'dateKeyV19_', 'dateMsV19_', 'definedV19_', 'positiveIntV19_', 'yesV19_',
  'uniqueCountV19_', 'rangesIntersect_', 'ensureSheetCapacityV19_']);

put('40_skills', ['rebuildSkillMatrixV19_', 'skillReadinessV19_', 'latestByTimestampV19_',
  'catalogMapsV19_', 'catalogObjectsV19_', 'normalizeSkillNameV19_', 'skillDomainV19_',
  'skillApplicableV19_', 'applySkillMatrixFilterV19_', 'hideSkillIdColumnV19_',
  'phaseMinimumsV19_', 'rewriteEngineSkillMetricV19_', 'skillCatalogIssuesV19_',
  'skillDeploymentIssuesV19_', 'catalogContextsV19_', 'compactEvidenceV19_',
  'recordSkillDirectV20_1', 'syncSkillQuickLogFormV19_', 'buildSkillsSystem']);

put('10_identity', ['masterTraineeMapV19_', 'traineeRecordV19_', 'stageLetterV19_',
  'promptingForStageV19_', 'stageRankV19_', 'currentDeciderV19_']);

put('50_decisions', ['advanceTraineeNow', 'workMyQueueV20_1', 'refreshHomeNowV20_1',
  'approveTraineeOnViewV20_1', 'openQueueRowV19_', 'needsDualSignoffV19_',
  'mergedRuleConflicts_', 'archiveTrainee']);

put('75_presentation', ['BRAND_V20_5', 'sheetPurposeV20_5_', 'badgeBlobV20_5_', 'badgeIsRealV20_5_',
  'brandSheetV20_5_', 'brandAllSheetsV20_5', 'HEADER_ALIAS_CACHE_V20_4', 'headerAliasesForV20_4_',
  'canonicalHeaderV20_4_', 'headerRenamesV20_4_', 'plumbingColumnsV20_4_',
  'repairDecisionQueueHeaderV20_4', 'auditEntryProfilesV20_4', 'tidyEntryProfileLegendV20_4',
  'renameHeadersV20_4', 'groupPlumbingColumnsV20_4', 'showAllColumnsV20_4',
  'evidenceSentenceV20_4_', 'rewriteEvidenceSummariesV20_4', 'TAB_CONSOLE_V20_3',
  'CONSOLE_HEADERS_V20_3', 'CONSOLE_COL_V20_3', 'CONSOLE_FIRST_ROW_V20_3',
  'openTraineeConsoleV20_3', 'buildTraineeConsoleV20_3', 'consoleFileLinksV20_3_',
  'applyConsoleLookV20_3_', 'buildTraineeFileV20_3', 'consoleEditV20_3_',
  'readableWidthForV20_3_', 'makeSheetsReadableV20_3', 'tabOrderV20_2_', 'dailyTabsV20_2_',
  'organizeTabsV20_2', 'showAllTabsV20_2', 'makeQueueReadableV20_1', 'fixQueueEntryUxV20_1',
  'queueLiveFilterApplyV20_1_', 'queueShowLiveV20_1', 'queueShowAllV20_1',
  'explainFlagsV20_1', 'ackFlagStyleV20_1', 'fixAllFlagsNowV20_1', 'simplifyFlagsV20_1',
  'unwrapAuditFormulasV20_1']);

put('70_admin_health', ['repairCancelledQueueRowsV20_2', 'reviewSectionV20_1_', 'reviewCoreV20_1',
  'reviewDeepV20_1', 'fullSystemReviewV20_1', 'hasStrayV19_', 'applyOperationalTabsV20_1',
  'rebuildSkillMatrix']);

put('90_recovery', ['phantomRowsV20_1_', 'previewPhantomRepairV20_1', 'fixPhantomsNowV20_1',
  'stepD_fixPhantoms', 'stepE_replayLostResponses', 'recoverLostSubmissionsV20_2',
  'replayMissingSinceV20_1_', 'stepF_backfillEvals', 'stepH_backfillNewestEvals',
  'stepG_fixEvalLink', 'stepI_fixAllFormLinks', 'stepJ_backfillAllHubTabs',
  'backfillRowKeysV20_1_', 'backfillHubTabV20_1', 'backfillCleanupPlanV20_1_',
  'previewBackfillCleanupV20_1', 'applyBackfillCleanupV20_1', 'stepK_cleanBackfill',
  'stepL_acknowledgeHistorical', 'catchUpUnprocessed', 'catchUpUnprocessedPreview',
  'catchUpUnprocessedV20_2_']);

put('99_config', ['BADGE_B64', 'SEV_V19', 'TV', 'PANEL_FIRST_ROW_V19', 'PANEL_ROWS_V19',
  'START_GRACE_DAYS_V19', 'QUEUE_REASONS_V19', 'DIGEST_COPY_TO_V19', 'SKILL_MATRIX_BACKUP_V19',
  'EV', 'SKILL_LABEL_V19', 'HUB_ASSETS_FOLDER_V19', 'PORTAL_FILE_V19', 'DUAL_SIGNOFF_LEVELS_V19',
  'DUAL_SIGNOFF_LEVEL_V19', 'DUAL_SIGNOFF_PHASE_V19', 'DUAL_ROLE_TRAINING_V19',
  'DUAL_ROLE_MEDICAL_V19', 'OPERATIONAL_TABS_V19', 'SKILL_MATRIX_HEADERS_V19',
  'SKILL_CATALOG_HEADERS_V19', 'TRAINEE_VIEWS_V19', 'SNOOZE_DAYS', 'DOMAIN_NAMES', 'HUB_URL',
  'BACKUP_FOLDER', 'SKILL_BURST_LIMIT_V20', 'SKILL_INFLATION_MIN_V20', 'SKILL_INFLATION_PCT_V20',
  'KEEP_TOOLS_V19', 'ONE_TIME_TOOLS_V19', 'SUPERSEDED_BLOCKS_V19']);

put('20_forms', ['goLiveV19', 'backToTestModeV19']);

put('85_freshstart', ['knownTabsV20_6_', 'sheetIsLiveFormDestinationV20_6_',
  'freshStartReport', 'freshStartClean', 'freshStartV20_6_']);

put('87_estate', [
  'CANONICAL_LIVE_SPREADSHEET_ID', 'ORPHAN_TWIN_SPREADSHEET_ID',
  'FORM_COPY_ARCHIVE_FOLDER_V20_6', 'STAGING_ARCHIVE_FOLDER_V20_6',
  'isFormCopyTitleV20_6_', 'liveTitleUnderCopyV20_6_', 'isSCEMSFormCopyTitleV20_6_',
  'formIdFromUrlV20_6_', 'ensureNamedFolderV20_6_', 'ensureDatedArchiveFolderV20_6_',
  'liveFormIdSetV20_6_', 'formCopyInventoryV20_6_', 'formEstateReport',
  'archiveFormCopies', 'archiveFormCopiesV20_6_', 'neutralizeBackupFormClonesV20_6_',
  'orphanResponseTabsV20_6_', 'engineDamageSummaryV20_6_',
  'decisionQueueHeaderGapV20_6_', 'estateHealthItemsV20_6_'
]);

/** Where one declaration goes. '' means nobody has said, and the build stops. */
function fileFor(unit) {
  if (BY_NAME[unit.name]) return BY_NAME[unit.name];
  if (KEEP[unit.section]) return KEEP[unit.section];
  return '';
}

module.exports = { FILES, fileFor, BY_NAME, KEEP };
