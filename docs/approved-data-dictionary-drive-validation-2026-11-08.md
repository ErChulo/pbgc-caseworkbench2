# Approved Data Dictionary: Drive validation and test setup

The current `data_dictionary_complete.xlsm` is available in the connected `pbgc-the-book-of-job/PBGC_CASEWORK_CURATED/02_TECHNICAL_SPECIFICATIONS/02_Field_Dictionaries/Current_Selected` directory. The user explicitly directed use of this file. The retrieved binary is 104,966 bytes and its SHA-256 is `d7b7c63a432ecc0e7e9e1371a65effeae552b13d8a53a952752bd206ee79bc96`, exactly matching the repository's already-pinned approved bytes. The file was processed as passive workbook data; its macros were not executed. It was not added to Git.

The checkout's tracked path remains a Git LFS pointer. To run the tests with an authorized local copy without replacing that pointer, set an absolute local path:

```sh
PBGC_DATA_DICTIONARY_PATH=/authorized/local/path/data_dictionary_complete.xlsm npm test
```

The override changes only where the unit test reads the workbook; it does not change the parser, expected size, expected hash, production artifact, schema or authorization policy. The test still fails closed on wrong-size or altered bytes. Avoid committing or transmitting the local workbook outside approved channels.

The focused parser suite passed four tests using the verified local workbook, including altered-byte and wrong-size rejection. The full suite passed **156 files and 1,206 tests** when those exact bytes were supplied. The original pointer alone remains insufficient and correctly produces `SIZE_MISMATCH`. This resolves the previously reported missing-workbook test blocker for this session, not the remaining end-to-end, office security, independent calculation validation or human approval gates. No real participant data or Excel execution was used.
