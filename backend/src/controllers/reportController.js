import Report from "../models/Report.js";
import User from "../models/User.js";

export async function submitReport(req, res) {
  try {
    const { reportedRollNumber, reason, roomId } = req.body;
    const reporterRollNumber = req.user.rollNumber;

    if (!reportedRollNumber || !reason) {
      return res.status(400).json({ error: "reportedRollNumber and reason are required" });
    }
    if (reportedRollNumber === reporterRollNumber) {
      return res.status(400).json({ error: "You can't report yourself" });
    }

    const report = await Report.create({
      reporterRollNumber,
      reportedRollNumber: reportedRollNumber.trim().toUpperCase(),
      reason: reason.trim(),
      roomId,
    });

    // Bump the reported user's count so repeat offenders are easy to spot
    await User.updateOne(
      { rollNumber: report.reportedRollNumber },
      { $inc: { reportCount: 1 } }
    );

    res.status(201).json({ message: "Report submitted", report });
  } catch (err) {
    res.status(500).json({ error: "Failed to submit report", details: err.message });
  }
}

// Admin: list reports, most recent first, optionally filtered by status
export async function listReports(req, res) {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const reports = await Report.find(filter).sort({ createdAt: -1 });
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reports", details: err.message });
  }
}

// Admin: ban the reported user and mark the report resolved
export async function banReportedUser(req, res) {
  try {
    const { reportId } = req.params;
    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ error: "Report not found" });

    await User.updateOne({ rollNumber: report.reportedRollNumber }, { isBanned: true });
    report.status = "banned";
    await report.save();

    res.json({ message: `${report.reportedRollNumber} has been banned`, report });
  } catch (err) {
    res.status(500).json({ error: "Failed to ban user", details: err.message });
  }
}

// Admin: dismiss a report without banning
export async function dismissReport(req, res) {
  try {
    const { reportId } = req.params;
    const report = await Report.findByIdAndUpdate(
      reportId,
      { status: "dismissed" },
      { new: true }
    );
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.json({ message: "Report dismissed", report });
  } catch (err) {
    res.status(500).json({ error: "Failed to dismiss report", details: err.message });
  }
}
