import { PluginFunction, PluginValidateFn, Types } from "@graphql-codegen/plugin-helpers";
import { DocumentMode } from "@graphql-codegen/visitor-plugin-common";
import { concatAST, GraphQLSchema } from "graphql";
import { extname } from "path";
import { RawSdkPluginConfig } from "./config";
import c from "./constants";
import { getChainKeys, getChildDocuments, getRootDocuments, processSdkDocuments } from "./documents";
import { getFragmentsFromAst } from "./fragments";
import { printSdkHandler } from "./handler";
import { printRequesterType } from "./requester";
import { debug, filterJoin } from "./utils";
import { createVisitor, SdkVisitor } from "./visitor";

/**
 * Graphql-codegen plugin for outputting the typed Linear sdk
 */
export const plugin: PluginFunction<RawSdkPluginConfig> = async (
  schema: GraphQLSchema,
  documents: Types.DocumentFile[],
  config: RawSdkPluginConfig
) => {
  /** Process a list of documents to add information for chaining the api operations */
  const sdkDocuments = processSdkDocuments(documents);
  debug("documents", sdkDocuments.length);

  /** Get all documents to be added to the root of the sdk */
  const rootDocuments = getRootDocuments(sdkDocuments);

  /** Ensure the nodes validate as a single application */
  const rootAst = concatAST(rootDocuments);

  /** Get a list of all fragment definitions */
  const rootFragments = getFragmentsFromAst(rootAst, config);
  debug("fragments", rootFragments.length);

  /** Create and process a visitor for each node */
  const rootVisitor = createVisitor(schema, documents, rootDocuments, rootFragments, config);

  /** Get all chain keys to create chain apis */
  const chainKeys = getChainKeys(sdkDocuments);

  const chainVisitors = chainKeys.map(chainKey => {
    /** Get a list of documents that are attached to this chain api key */
    const chainDocuments = getChildDocuments(sdkDocuments, chainKey);
    debug(chainKey, "chainDocuments", chainDocuments.length);

    /** Create and process a visitor for each chained api */
    return createVisitor(schema, documents, chainDocuments, rootFragments, config, chainKey);
  });

  return {
    /** Add any initial imports */
    prepend: [
      /** Import GraphQLError and DocumentNode if required */
      `import { GraphQLError, ${config.documentMode !== DocumentMode.string ? "DocumentNode" : ""} } from 'graphql'`,
    ],
    content: filterJoin(
      [
        /** Import and export types */
        `import * as ${c.NAMESPACE_TYPE} from '${config.typeFile}'`,
        `export * from '${config.typeFile}'\n`,
        /** Import and export documents */
        `import * as ${c.NAMESPACE_DOCUMENT} from '${config.documentFile}'`,
        `export * from '${config.documentFile}'\n`,
        /** Print the requester function */
        ...printRequesterType(config),
        /** Print the handler function */
        printSdkHandler(),
        /** Print the chained api functions */
        ...chainVisitors.map(v => v.visitor.sdkContent),
        /** Print the root function */
        rootVisitor.visitor.sdkContent,
      ],
      "\n"
    ),
  };
};

/**
 * Validate use of the plugin
 */
export const validate: PluginValidateFn = async (
  schema: GraphQLSchema,
  documents: Types.DocumentFile[],
  config: RawSdkPluginConfig,
  outputFile: string
) => {
  const prefix = `Plugin "${process.env.npm_package_name}" config requires`;

  debug("config", config);

  if (extname(outputFile) !== ".ts") {
    throw new Error(`${prefix} output file extension to be ".ts" but is "${outputFile}"`);
  }

  if (!config.typeFile || typeof config.typeFile !== "string") {
    throw new Error(
      `${prefix} typeFile to be a string path to a type file generated by "typescript" and "typescript-operations" plugins`
    );
  }

  if (!config.documentFile || typeof config.documentFile !== "string") {
    throw new Error(
      `${prefix} documentFile to be a string path to a document file generated by "typescript-document-nodes"`
    );
  }
};

export { SdkVisitor };
