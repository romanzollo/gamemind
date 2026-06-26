const { execSync } = require("child_process");

function getPidsOnPort(port) {
  if (process.platform !== "win32") {
    try {
      const output = execSync(`lsof -ti:${port}`, { encoding: "utf8" });
      return output.trim().split(/\s+/).filter(Boolean);
    } catch {
      return [];
    }
  }

  try {
    const output = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
      { encoding: "utf8" },
    );

    return output.trim().split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

function killPid(pid) {
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    } else {
      execSync(`kill -9 ${pid}`, { stdio: "ignore" });
    }

    console.log(`Stopped process ${pid}`);
  } catch {
    // Process may already be gone.
  }
}

for (const port of [3000, 3001]) {
  const pids = [...new Set(getPidsOnPort(port))];

  for (const pid of pids) {
    killPid(pid);
  }
}
