
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "1mb" }));

// ======================================
// 1. healthData.json 불러오기
// ======================================

const dataPath = path.join(__dirname, "healthData.json");

let healthData = [];

try {
  const loadedData = JSON.parse(
    fs.readFileSync(dataPath, "utf8")
  );

  if (!Array.isArray(loadedData)) {
    throw new Error("JSON 데이터는 배열 형태여야 합니다.");
  }

  healthData = loadedData;

  console.log(
    `건강정보 데이터 ${healthData.length}개 불러오기 완료`
  );

  if (healthData.length !== 45) {
    console.warn("주의: 데이터 항목 수가 45개가 아닙니다.");
  }

} catch (error) {
  console.error(
    "건강정보 데이터 불러오기 실패:",
    error.message
  );
}

// ======================================
// 2. 웹사이트 파일 연결
// ======================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/style.css", (req, res) => {
  res.sendFile(path.join(__dirname, "style.css"));
});

app.get("/script.js", (req, res) => {
  res.sendFile(path.join(__dirname, "script.js"));
});

// ======================================
// 3. 입력 문장 정리 함수
// ======================================

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getKeywords(item) {
  if (Array.isArray(item.keywords)) {
    return [
      ...new Set(
        item.keywords
          .filter(value => typeof value === "string")
          .map(normalizeText)
          .filter(Boolean)
      )
    ];
  }

  if (typeof item.keywords === "string") {
    return [
      ...new Set(
        item.keywords
          .split(/[,，;；]/)
          .map(normalizeText)
          .filter(Boolean)
      )
    ];
  }

  return [];
}

// ======================================
// 4. 등록된 건강정보와 입력 문장 비교
// ======================================

// 주의: 키워드 기반 자료 검색입니다.
// 문장의 의미를 완벽히 이해하거나 실시간으로
// 의학적 사실을 판정하는 기능은 아닙니다.

function verifyHealthInformation(category, inputText) {
  const normalizedInput = normalizeText(inputText);

  const categoryData = healthData.filter(
    item => item.category === category
  );

  if (!categoryData.length) {
    return {
      success: true,
      status: "판단 보류",
      evidence: "선택한 분야에 등록된 자료가 없습니다.",
      sources: [],
      review: null,
      matched: false,
      reason: "해당 분야의 등록 자료가 없습니다."
    };
  }

  const results = categoryData.map(item => {
    const keywords = getKeywords(item);

    const matchedKeywords = keywords.filter(
      keyword =>
        keyword && normalizedInput.includes(keyword)
    );

    const matchRatio = keywords.length
      ? matchedKeywords.length / keywords.length
      : 0;

    const exactClaim =
      normalizeText(item.claim || "") === normalizedInput;

    const score =
      (exactClaim ? 100 : 0) +
      matchedKeywords.reduce(
        (sum, word) => sum + Math.min(word.length, 12),
        0
      ) +
      matchRatio * 10;

    return {
      item,
      matchedKeywords,
      matchCount: matchedKeywords.length,
      matchRatio,
      exactClaim,
      score
    };
  });

  results.sort((a, b) => b.score - a.score);

  const best = results[0];
  const second = results[1];

  // 키워드가 충분히 일치하지 않으면 판단 보류

  if (
    !best ||
    (
      !best.exactClaim &&
      (best.matchCount < 2 || best.matchRatio < 0.34)
    )
  ) {
    return {
      success: true,
      status: "판단 보류",
      evidence:
        "입력한 문장과 직접 비교할 수 있는 등록 자료를 충분히 찾지 못했습니다. 핵심 주장과 대상을 더 구체적으로 입력하거나 공식 자료를 직접 확인해 주세요.",
      sources: [],
      review: null,
      matched: false,
      reason:
        "등록 자료와 일치하는 키워드가 충분하지 않아 기존 판정을 적용하지 않았습니다."
    };
  }

  // 비슷한 점수의 자료가 여러 개면 판단 보류

  if (
    second &&
    !best.exactClaim &&
    best.matchCount === second.matchCount &&
    Math.abs(best.score - second.score) < 2
  ) {
    return {
      success: true,
      status: "판단 보류",
      evidence:
        "여러 등록 자료가 비슷한 수준으로 일치해 하나의 결과를 선택하기 어렵습니다. 문장을 더 구체적으로 입력해 주세요.",
      sources: [],
      review: null,
      matched: false,
      reason:
        "서로 다른 자료가 비슷하게 일치하여 오판을 피하기 위해 판단을 보류했습니다."
    };
  }

  const item = best.item;

  const allowedVerdicts = [
    "근거 충분",
    "일부 일치",
    "근거와 불일치",
    "판단 보류"
  ];

  return {
    success: true,

    status: allowedVerdicts.includes(item.verdict)
      ? item.verdict
      : "판단 보류",

    evidence:
      item.evidence ||
      item.reason ||
      "등록된 상세 근거가 없습니다.",

    sources: Array.isArray(item.sources)
      ? item.sources
      : (item.sources ? [item.sources] : []),

    matched: true,
    matchedClaim: item.claim || "",
    matchedKeywords: best.matchedKeywords,

    // healthData.json에 저장된 검토 결과를 그대로 전달
    review: item.review || null,

    reviewStatus: item.reviewStatus || "pending_review",
    reason: item.reason || "",
    itemId: item.id,

    message:
      "등록된 자료 중 관련 키워드가 일치하는 항목을 찾았습니다."
  };
}

// ======================================
// 5. 서버 상태 확인
// ======================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "HEALTH CHECK AI 서버가 정상적으로 작동 중입니다.",
    dataCount: healthData.length
  });
});

// ======================================
// 6. 45개 전체 검토 기록 조회
// ======================================

app.get("/api/reviews", (req, res) => {
  res.json({
    success: true,
    count: healthData.length,

    items: healthData.map(item => ({
      id: item.id,
      topic: item.topic,
      category: item.category,
      review: item.review || null
    }))
  });
});

// ======================================
// 7. 건강정보 비교 API
// ======================================

app.post("/api/verify", (req, res) => {
  const { category, text } = req.body || {};

  const allowedCategories = [
    "nutrition",
    "medicine",
    "lifestyle"
  ];

  if (
    typeof category !== "string" ||
    typeof text !== "string" ||
    !category.trim() ||
    !text.trim()
  ) {
    return res.status(400).json({
      success: false,
      message: "분야와 건강정보를 입력해 주세요."
    });
  }

  if (!allowedCategories.includes(category)) {
    return res.status(400).json({
      success: false,
      message: "올바른 건강정보 분야를 선택해 주세요."
    });
  }

  if (text.length > 2000) {
    return res.status(400).json({
      success: false,
      message: "입력은 2000자 이하로 해 주세요."
    });
  }

  if (!healthData.length) {
    return res.status(500).json({
      success: false,
      message: "건강정보 데이터베이스를 불러오지 못했습니다."
    });
  }

  const result = verifyHealthInformation(category, text);

  res.json({
    ...result,
    category,

    message: result.matched
      ? "등록된 자료와 비교했습니다."
      : "일치하는 자료가 충분하지 않아 판단을 보류했습니다."
  });
});

// ======================================
// 8. 공식 기관 안내
// ======================================

app.get("/api/sources", (req, res) => {
  res.json({
    success: true,

    sources: [
      {
        name: "질병관리청",
        description: "질병 예방 및 건강정보",
        url: "https://www.kdca.go.kr/"
      },
      {
        name: "국가건강정보포털",
        description: "질병·증상·생활습관 정보",
        url: "https://health.kdca.go.kr/"
      },
      {
        name: "식품의약품안전처",
        description: "의약품·식품·건강기능식품 정보",
        url: "https://www.mfds.go.kr/"
      },
      {
        name: "식품안전나라",
        description: "식품 및 건강기능식품 정보",
        url: "https://www.foodsafetykorea.go.kr/"
      },
      {
        name: "세계보건기구(WHO)",
        description: "국제 보건 권고 및 건강정보",
        url: "https://www.who.int/"
      }
    ]
  });
});

// ======================================
// 9. 서버 실행
// ======================================

app.listen(PORT, () => {
  console.log(
    `HEALTH CHECK AI 서버 실행 중: http://localhost:${PORT}`
  );
});