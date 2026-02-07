import { Controller, Get, Post, Query, Body, Res, Logger, Req } from '@nestjs/common';
import { Response, Request } from 'express';
import { BiometricService } from './biometric.service';

@Controller('iclock')
export class AdmsController {
  private readonly logger = new Logger(AdmsController.name);
  // Map short numeric IDs to database UUIDs (ZK devices truncate long IDs)
  private commandIdMap = new Map<string, string>();
  private commandCounter = 1;

  constructor(private readonly biometricService: BiometricService) {}

  @Get('cdata')
  async handleHandshake(
    @Query('SN') serialNumber: string,
    @Query('options') options: string,
    @Query('pushver') pushver: string,
    @Query('language') language: string,
    @Res() res: Response,
  ) {
    this.logger.log(`ADMS Handshake: SN=${serialNumber}, options=${options}, pushver=${pushver}`);

    if (!serialNumber) {
      return res.status(400).send('ERROR: Missing SN');
    }

    const result = await this.biometricService.handleHandshake(serialNumber);

    if (!result.success) {
      return res.status(403).send(`ERROR: ${result.message}`);
    }

    // Get device timezone offset (absolute UTC offset, e.g. 4 for Dubai/Gulf, 5 for Pakistan)
    const device = await this.biometricService.getDeviceBySerial(serialNumber);
    const deviceUtcOffset = device?.timezoneOffset ?? 4; // Default to Gulf Standard Time (UTC+4)

    // Send ServerTime as UTC — the device uses TimeZone param to calculate its local time
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    const hours = String(now.getUTCHours()).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    const seconds = String(now.getUTCSeconds()).padStart(2, '0');
    const serverTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

    // Device timezone is its direct UTC offset
    const deviceTzHours = deviceUtcOffset;

    this.logger.log(`Sending ServerTime=${serverTime} (UTC) to device ${serialNumber}, TimeZone=${deviceTzHours}`);

    const response = [
      `GET OPTION FROM: ${serialNumber}`,
      `ServerTime=${serverTime}`,
      `Stamp=9999`,
      `OpStamp=9999`,
      `PhotoStamp=9999`,
      `ErrorDelay=60`,
      `Delay=10`,
      `TransTimes=00:00;14:05`,
      `TransInterval=1`,
      `TransFlag=TransData AttLog OpLog`,
      `TimeZone=${deviceTzHours}`,
      `Realtime=1`,
      `Encrypt=0`,
      `ServerVer=2.4.1`,
      `ATTLOGStamp=0`,
      `OPERLOGStamp=0`,
    ].join('\n');

    this.logger.log(`Handshake response TimeZone=${deviceTzHours}`);

    res.setHeader('Content-Type', 'text/plain');
    return res.send(response);
  }

  @Post('cdata')
  async handlePunchData(
    @Query('SN') serialNumber: string,
    @Query('table') table: string,
    @Query('Stamp') stamp: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.logger.log(`ADMS POST: SN=${serialNumber}, table=${table}, Stamp=${stamp}`);

    if (!serialNumber) {
      return res.status(400).send('ERROR: Missing SN');
    }

    // Get raw body - handle both string and buffer
    let rawBody = '';
    if (typeof body === 'string') {
      rawBody = body;
    } else if (Buffer.isBuffer(body)) {
      rawBody = body.toString('utf-8');
    } else if (req.body) {
      rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    this.logger.log(`ADMS Raw body (${table}): ${rawBody}`);

    if (table === 'ATTLOG') {
      const lines = rawBody.split('\n').filter((line: string) => line.trim());

      for (const line of lines) {
        try {
          const punchData = this.parseAttLogLine(serialNumber, line);
          if (punchData) {
            await this.biometricService.handlePunch(punchData);
          }
        } catch (error) {
          this.logger.error(`Error processing ATTLOG line: ${line}`, error.stack);
        }
      }

      return res.send('OK');
    }

    if (table === 'OPERLOG') {
      this.logger.log(`OPERLOG received from ${serialNumber}: ${rawBody}`);
      return res.send('OK');
    }

    return res.send('OK');
  }

  @Get('getrequest')
  async getCommands(
    @Query('SN') serialNumber: string,
    @Res() res: Response,
  ) {
    this.logger.log(`ADMS GetRequest: SN=${serialNumber}`);

    if (!serialNumber) {
      return res.status(400).send('ERROR: Missing SN');
    }

    // Update lastSyncAt to keep device online status accurate
    await this.biometricService.updateDeviceSync(serialNumber);

    // Fetch pending commands for this device
    const commands = await this.biometricService.getPendingCommands(serialNumber);

    if (commands.length === 0) {
      res.setHeader('Content-Type', 'text/plain');
      return res.send('OK');
    }

    // Format commands as ADMS protocol: C:<short_id>:<command_data>
    // Use short numeric IDs because ZK devices truncate long UUIDs
    const commandLines: string[] = [];
    for (const cmd of commands) {
      const shortId = String(this.commandCounter++);
      this.commandIdMap.set(shortId, cmd.id);
      commandLines.push(`C:${shortId}:${cmd.commandData}`);
      await this.biometricService.markCommandSent(cmd.id);
    }

    this.logger.log(`Sending ${commands.length} commands to device ${serialNumber}`);

    res.setHeader('Content-Type', 'text/plain');
    return res.send(commandLines.join('\n'));
  }

  @Post('devicecmd')
  async handleDeviceCmd(
    @Query('SN') serialNumber: string,
    @Query('ID') cmdId: string,
    @Query('Return') cmdReturn: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Parse ID and Return from query params OR body (device may send either way)
    let id = cmdId;
    let returnVal = cmdReturn;

    // Parse body if query params are missing
    if (!id || !returnVal) {
      let rawBody = '';
      if (typeof body === 'string') {
        rawBody = body;
      } else if (Buffer.isBuffer(body)) {
        rawBody = body.toString('utf-8');
      } else if (req.body) {
        rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }

      if (rawBody) {
        this.logger.log(`DeviceCmd raw body: ${rawBody}`);
        // Parse key=value pairs from body (ID=xxx&Return=0 or ID=xxx\nReturn=0)
        const idMatch = rawBody.match(/ID[=:]([^\s&\n]+)/i);
        const returnMatch = rawBody.match(/Return[=:]([^\s&\n]+)/i);
        if (idMatch && !id) id = idMatch[1];
        if (returnMatch && !returnVal) returnVal = returnMatch[1];
      }
    }

    this.logger.log(`ADMS DeviceCmd: SN=${serialNumber}, ID=${id}, Return=${returnVal}`);

    if (id) {
      // Resolve short numeric ID back to database UUID
      const dbId = this.commandIdMap.get(id) || id;
      if (this.commandIdMap.has(id)) {
        this.commandIdMap.delete(id);
      }
      try {
        await this.biometricService.markCommandExecuted(dbId, returnVal || '-1');
        this.logger.log(`Command ${dbId} marked as ${returnVal === '0' ? 'executed' : 'failed'} (Return=${returnVal})`);
      } catch (error) {
        this.logger.error(`Failed to update command ${dbId}: ${error.message}`);
      }
    }

    return res.send('OK');
  }

  @Post('fdata')
  async handleFData(
    @Query('SN') serialNumber: string,
    @Query('table') table: string,
    @Body() body: any,
    @Res() res: Response,
  ) {
    this.logger.log(`ADMS FData: SN=${serialNumber}, table=${table}`);

    return res.send('OK');
  }

  private parseAttLogLine(serialNumber: string, line: string): any {
    const parts = line.split('\t');

    if (parts.length < 2) {
      const spaceParts = line.split(/\s+/);
      if (spaceParts.length >= 2) {
        return {
          SN: serialNumber,
          PIN: spaceParts[0],
          AttTime: spaceParts.slice(1, 3).join(' '),
          Status: spaceParts[3] || '0',
          Verify: spaceParts[4] || '1',
        };
      }
      return null;
    }

    return {
      SN: serialNumber,
      PIN: parts[0],
      AttTime: parts[1],
      Status: parts[2] || '0',
      Verify: parts[3] || '1',
      WorkCode: parts[4] || '',
      Reserved1: parts[5] || '',
      Reserved2: parts[6] || '',
    };
  }
}
