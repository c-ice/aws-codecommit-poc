import {
    AssociateApprovalRuleTemplateWithRepositoryCommand,
    BatchDescribeMergeConflictsCommand,
    BranchInfo,
    ConflictResolution,
    ConflictResolutionStrategyTypeEnum,
    CreateUnreferencedMergeCommitCommand,
    CreateUnreferencedMergeCommitCommandInput,
    DescribeMergeConflictsCommand,
    GetBranchCommand,
    GetBranchOutput,
    GetFolderCommand,
    GetFolderInput,
    GetMergeCommitCommand,
    GetMergeCommitCommandInput,
    GetMergeConflictsCommand,
    GetMergeConflictsInput,
    ListBranchesCommand,
    ListRepositoriesCommand,
    MergeBranchesBySquashCommand,
    MergeBranchesBySquashCommandInput,
    MergeOptionTypeEnum,
    ReplacementTypeEnum,
} from '@aws-sdk/client-codecommit';
import { client, log } from './client';

async function main() {
    const params = {
        /** input parameters */
    };
    const command = new ListRepositoriesCommand(params);

    // async/await.
    try {
        const data = await client.send(command);
        // log(data);

        const branches$ = data.repositories?.map(repo => listBranches(repo.repositoryName));

        if (branches$ && branches$.length > 0) {
            const branches = await Promise.all(branches$);

            const repos = data.repositories?.reduce((result, repo, index) => {
                return [
                    ...result,
                    {
                        ...repo,
                        branches: branches[index],
                    },
                ];
            }, [] as any[]);

            if (repos) {
                const repo = repos.find(repo => repo.repositoryName === 'future-conflict');

                log('repo: ', repo);

                // const folder0 = await getFolder(repo.repositoryName, repo.branches[0].commitId);

                const branchsRepo = repo.branches.reduce((result: any, branch: BranchInfo) => {
                    return {
                        ...result,
                        [branch.branchName + '']: {
                            ...branch,
                        },
                    };
                }, {});

                // const result = await getMergeCommit(
                //     repo.repositoryName,
                //     {
                //         commitId: '8df46c818433a9c748cac7feef14d12a2791ad6f',
                //     },
                //     branchsRepo.t12
                // );

                // log('getMergeCommit: ', result);

                const conflict = await getMergeConflicts(repo.repositoryName, branchsRepo.t12, branchsRepo.t11);

                const conflicts = (conflict?.conflicts || []).map(c => ({
                    ...c,
                    mergeHunks: c.mergeHunks!.map(mh => {
                        return {
                            ...mh,
                            destination: !mh.destination
                                ? undefined
                                : {
                                      ...mh.destination,
                                      hunkContent: Buffer.from(mh.destination.hunkContent || '', 'base64')
                                          .toString('ascii')
                                          .replace(/\t/g, '    '),
                                  },
                            source: !mh.source
                                ? undefined
                                : {
                                      ...mh.source,
                                      hunkContent: Buffer.from(mh.source.hunkContent || '', 'base64')
                                          .toString('ascii')
                                          .replace(/\t/g, '    '),
                                  },
                            base: !mh.base
                                ? undefined
                                : {
                                      ...mh.base,
                                      hunkContent: Buffer.from(mh.base.hunkContent || '', 'base64')
                                          .toString('ascii')
                                          .replace(/\t/g, '    '),
                                  },
                        };
                    }),
                }));

                log('conflicts: ', conflicts);

                // taketo nieco mohlo sposobit chybu v AWS UI ak toto pouzili
                const safeSplit = (src: string | null | undefined, separator: string) => {
                    return src !== null && src !== undefined && src !== '' ? src.split(separator) : null;
                };

                const lines = conflicts[0].mergeHunks.flatMap(mh => {
                    if (!mh.isConflict) {
                        const base = mh.base?.hunkContent.split('\n');
                        const destination = mh.destination?.hunkContent.split('\n'); // ours
                        const source = mh.source?.hunkContent.split('\n'); // theirs
                        const result = [];
                        if (base && !destination && !source) {
                            if (base.length > 1 && base[base.length - 1] === '') base.pop(); // pridava to prazdne riadky tak teraz uberam
                            result.push(...base);
                        }
                        if (destination) {
                            if (destination.length > 1 && destination[destination.length - 1] === '') destination.pop(); // pridava to prazdne riadky tak teraz uberam
                            result.push(...destination);
                        }
                        if (source) {
                            if (source.length > 1 && source[source.length - 1] === '') source.pop(); // pridava to prazdne riadky tak teraz uberam
                            result.push(...source);
                        }
                        return result;
                        // return [base || [], destination || [], source || []];
                    } else {
                        return [
                            '<<<<<<<',
                            ...(mh.destination?.hunkContent.split('\n').slice(0, -1) || ['']),
                            '=======',
                            ...(mh.source?.hunkContent.split('\n').slice(0, -1) || ['']),
                            '>>>>>>>',
                        ];
                    }
                });

                log('lines: ', lines.join('\n'));

                // resolution from FE, both content in base64
                const resolutionContent = lines
                    .filter(
                        line =>
                            line.indexOf('<<<<<<<') === -1 &&
                            line.indexOf('=======') === -1 &&
                            line.indexOf('>>>>>>>') === -1,
                    )
                    .join('\n');

                /// conflict resolution start here

                const conflictResolution = {
                    replaceContents: [
                        {
                            content: Buffer.from(Buffer.from(resolutionContent).toString('base64'), 'base64'),
                            filePath: conflicts[0].conflictMetadata?.filePath,
                            replacementType: ReplacementTypeEnum.USE_NEW_CONTENT,
                        },
                    ],
                };

                const resultmerge = await mergeAsUnreferencedCommit(
                    repo.repositoryName,
                    branchsRepo.t12,
                    branchsRepo.t11,
                    conflictResolution,
                );

                log('conflict resolved: ', resultmerge);

                const resultmergeCommit = await createMergeCommit(
                    repo.repositoryName,
                    branchsRepo.t12,
                    branchsRepo.t11,
                    conflictResolution,
                );

                log('merge Commit result: ', resultmergeCommit);
            }
        }

        // process data.
    } catch (error) {
        // error handling.
        console.error(error);
    } finally {
        // finally.
        console.log('finished');
    }
}

function listBranches(repositoryName: string | undefined) {
    const params = {
        repositoryName,
    };
    const command = new ListBranchesCommand(params);

    return client.send(command).then(branches => {
        return Promise.all(branches.branches!.map(branchName => getBranch(repositoryName, branchName)));
    });
}

function getBranch(repositoryName: string | undefined, branchName: string) {
    const params = {
        repositoryName,
        branchName,
    };
    const command = new GetBranchCommand(params);

    return client.send(command).then(({ branch }) => {
        log(repositoryName, branch);

        return branch;
    });
}

function getFolder(repositoryName: string, commitSpecifier: string) {
    const params: GetFolderInput = {
        repositoryName,
        commitSpecifier,
        folderPath: '/',
    };
    const command = new GetFolderCommand(params);

    return client.send(command).then(folder => {
        log(repositoryName, params.folderPath, folder);

        return folder;
    });
}

function getMergeConflicts(repositoryName: string, sourceBranch: BranchInfo, destinationBranch: BranchInfo) {
    const params: GetMergeConflictsInput = {
        repositoryName,
        sourceCommitSpecifier: sourceBranch.commitId,
        destinationCommitSpecifier: destinationBranch.commitId,
        mergeOption: MergeOptionTypeEnum.SQUASH_MERGE,
        conflictResolutionStrategy: ConflictResolutionStrategyTypeEnum.AUTOMERGE,
    };
    const command = new GetMergeConflictsCommand(params);

    return client.send(command).then(result => {
        log(result);

        if (!result.mergeable && result.conflictMetadataList && result.conflictMetadataList.length > 0) {
            const command = new BatchDescribeMergeConflictsCommand({
                ...params,
                filePaths: result.conflictMetadataList.map(cml => cml.filePath!),
            });

            return client.send(command);
        }

        return null;
    });
}

/**
 *
 * @param repositoryName
 * @param sourceBranch
 * @param destinationBranch
 * @param resolutionContent base64 encoded string
 * @returns
 */
function mergeAsUnreferencedCommit(
    repositoryName: string,
    sourceBranch: BranchInfo,
    destinationBranch: BranchInfo,
    conflictResolution: ConflictResolution,
) {
    const params: CreateUnreferencedMergeCommitCommandInput = {
        repositoryName,
        sourceCommitSpecifier: sourceBranch.commitId,
        destinationCommitSpecifier: destinationBranch.commitId,
        mergeOption: MergeOptionTypeEnum.SQUASH_MERGE,
        conflictResolutionStrategy: ConflictResolutionStrategyTypeEnum.AUTOMERGE,
        // authorName?: string;
        // email?: string
        // commitMessage?: string;
        conflictResolution,
    };
    const command = new CreateUnreferencedMergeCommitCommand(params);

    return client.send(command);
}

function createMergeCommit(
    repositoryName: string,
    sourceBranch: BranchInfo,
    destinationBranch: BranchInfo,
    conflictResolution: ConflictResolution,
) {
    const params: MergeBranchesBySquashCommandInput = {
        repositoryName,
        sourceCommitSpecifier: sourceBranch.commitId,
        destinationCommitSpecifier: destinationBranch.commitId,
        targetBranch: destinationBranch.branchName,
        // mergeOption: MergeOptionTypeEnum.SQUASH_MERGE,
        conflictResolutionStrategy: ConflictResolutionStrategyTypeEnum.AUTOMERGE,
        // authorName?: string;
        // email?: string
        // commitMessage?: string;
        conflictResolution,
    };
    const command = new MergeBranchesBySquashCommand(params);

    return client.send(command);
}

function getMergeCommit(repositoryName: string, sourceBranch: BranchInfo, destinationBranch: BranchInfo) {
    const params: GetMergeCommitCommandInput = {
        repositoryName,
        sourceCommitSpecifier: sourceBranch.commitId,
        destinationCommitSpecifier: destinationBranch.commitId,
        conflictResolutionStrategy: ConflictResolutionStrategyTypeEnum.AUTOMERGE,
    };
    const command = new GetMergeCommitCommand(params);

    return client.send(command);
}

main();
