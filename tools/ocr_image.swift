import Foundation
import Vision
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
request.recognitionLanguages = ["en-US"]
try VNImageRequestHandler(url: URL(fileURLWithPath: CommandLine.arguments[1]), options: [:]).perform([request])
let rows: [[String: Any]] = (request.results ?? []).compactMap { observation in
 guard let candidate = observation.topCandidates(1).first else { return nil }
 let bounds = observation.boundingBox
 return ["text": candidate.string, "confidence": candidate.confidence,
         "x": bounds.midX, "y": 1-bounds.midY, "width": bounds.width, "height": bounds.height]
}
let data = try JSONSerialization.data(withJSONObject: rows, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
