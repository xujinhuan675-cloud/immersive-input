import { appCacheDir, appConfigDir, join } from "@tauri-apps/api/path";
import { readBinaryFile, readTextFile } from "@tauri-apps/api/fs";
import { invoke } from "@tauri-apps/api/tauri";
import Database from "tauri-plugin-sql-api";
import { http } from "@tauri-apps/api";
import CryptoJS from "crypto-js";
import { osType } from "./env";

function createPluginEntry(script, pluginType) {
    if (!/^[A-Za-z_$][\w$]*$/.test(pluginType)) {
        throw new Error(`Invalid plugin type: ${pluginType}`);
    }

    return new Function(
        "pluginType",
        "pluginName",
        "configDir",
        "cacheDir",
        "pluginDir",
        "entryFile",
        "utils",
        "run",
        "tauriFetch",
        "http",
        "readBinaryFile",
        "readTextFile",
        "Database",
        "CryptoJS",
        "osType",
        `${script}\n;return ${pluginType};`
    );
}

export async function invoke_plugin(pluginType, pluginName) {
    let configDir = await appConfigDir();
    let cacheDir = await appCacheDir();
    let pluginDir = await join(configDir, "plugins", pluginType, pluginName);
    let entryFile = await join(pluginDir, "main.js");
    let script = await readTextFile(entryFile);
    async function run(cmdName, args) {
        return await invoke("run_binary", {
            pluginType,
            pluginName,
            cmdName,
            args
        });
    }
    const utils = {
        tauriFetch: http.fetch,
        http,
        readBinaryFile,
        readTextFile,
        Database,
        CryptoJS,
        run,
        cacheDir, // String
        pluginDir, // String
        osType,// "Windows_NT", "Darwin", "Linux"
    }
    const pluginEntry = createPluginEntry(script, pluginType)(
        pluginType,
        pluginName,
        configDir,
        cacheDir,
        pluginDir,
        entryFile,
        utils,
        run,
        utils.tauriFetch,
        http,
        readBinaryFile,
        readTextFile,
        Database,
        CryptoJS,
        osType
    );
    return [pluginEntry, utils];
}
