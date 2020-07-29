import path from 'path';
import chalk from 'chalk';
import { executeSynchronous, lowerCaseEquals, safeUnlink } from '../utils';
import { findAutogenEntries } from '../autogenlist';
import { saveAutogeneratedSchemaRefs, SchemaConfiguration, schemaPostProcess } from '../generate';
import * as constants from '../constants';

async function getChangedSchemas(repoPath: string) {
    var git = require('nodegit-kit');
    const repo = await git.open(repoPath);
    const status = await git.status(repo);
    const changedSchemas: { path: string, isNew: boolean }[] = [];
    for (const stat of status) {
        if (stat.path.toString().split(path.sep).indexOf('schemas') != -1
            && path.extname(stat.path) === '.json') {
            if (stat.status !== 'modified' && stat.status !== 'new') {
                throw new Error(`Undefined file status for '${stat.path}'.`);
            } else {
                if (stat.status === 'modified') {
                    changedSchemas.push({
                        path: path.join(repoPath, stat.path),
                        isNew: false
                    });
                } else {
                    changedSchemas.push({
                        path: path.join(repoPath, stat.path),
                        isNew: true
                    });
                }
            }
        }
    }
    return changedSchemas;
}

executeSynchronous(async () => {
    const basePath = process.argv[2];
    const autogenEntries = findAutogenEntries(basePath);
    let changedSchemas = await getChangedSchemas(constants.generatorRoot);
    let schemaConfigs: SchemaConfiguration[] = [];
    for (const changedSchema of changedSchemas) {
        const changedSchemaPath = changedSchema.path;
        console.log('Processing changed schema file: ' + chalk.green(changedSchemaPath));
        const namespace = path.basename(changedSchemaPath.substring(0, changedSchemaPath.lastIndexOf(path.extname(changedSchemaPath))));
        const autogenEntriesSameNamespace = autogenEntries
        .filter(autogenEntry => lowerCaseEquals(autogenEntry.namespace, namespace));
        if (autogenEntriesSameNamespace.length === 0) {
            const localSchemaConfig = await schemaPostProcess(changedSchemaPath, changedSchema.isNew);
            schemaConfigs.push(localSchemaConfig);
        } else {
            if (autogenEntriesSameNamespace.length > 1) {
                throw new Error(`Multiple autogenEntries for '${changedSchemaPath}'`);
            }
            const autogenlistConfig = autogenEntriesSameNamespace[0];
            const localSchemaConfig = await schemaPostProcess(changedSchemaPath, changedSchema.isNew, autogenlistConfig);
            schemaConfigs.push(localSchemaConfig);
        }
    }
    await saveAutogeneratedSchemaRefs(schemaConfigs);
    await safeUnlink(path.join(constants.generatorRoot, "schemas", "code-model-v1"));
});
