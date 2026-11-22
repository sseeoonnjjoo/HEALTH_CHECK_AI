
const express = require("express");
const path = require("path");
const fs = require("fs");

require("dotenv").config({
  path: path.join(__dirname, ".env"),
  override: true
});

const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

const openai = apiKey ? new OpenAI({ apiKey }) : null;

app.use(express.json({ limit: "1mb" }));

console.log("==================================");
console.log("HEALTH CHECK AI 서버 준비");
console.log("API 키 읽기:", apiKey ? "성공" : "실패");
console.log("==================================");

// ==========================================
// 1. 건강정보 데이터 불러오기
// ==========================================

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
} catch (error) {
  console.error("건강정보 데이터 불러오기 실패:", error.message);
}

// ==========================================
// 2. 웹사이트 파일 제공
// ==========================================

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ==========================================
// 3. 문자열 정리
// ==========================================

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ==========================================
// 4. 키워드 가져오기
// ==========================================

function getKeywords(item) {
  if (Array.isArray(item.keywords)) {
    return [...new Set(
      item.keywords
        .filter(value => typeof value === "string")
        .map(normalizeText)
        .filter(Boolean)
    )];
  }

  if (typeof item.keywords === "string") {
    return [...new Set(
      item.keywords
        .split(/[,，;；]/)
        .map(normalizeText)
        .filter(Boolean)
    )];
  }

  return [];
}

// ==========================================
// 5. 기존 45개 자료 비교
// ==========================================

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
      keyword => keyword && normalizedInput.includes(keyword)
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
        "입력한 문장과 직접 비교할 수 있는 등록 자료를 충분히 찾지 못했습니다.",
      sources: [],
      review: null,
      matched: false,
      reason:
        "등록 자료와 일치하는 키워드가 충분하지 않아 AI 분석으로 전달합니다."
    };
  }

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
        "여러 등록 자료가 비슷한 수준으로 일치해 하나의 결과를 선택하기 어렵습니다.",
      sources: [],
      review: null,
      matched: false,
      reason:
        "서로 다른 자료가 비슷하게 일치하여 AI 추가 분석으로 전달합니다."
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
    review: item.review || null,
    reviewStatus: item.reviewStatus || "pending_review",
    reason: item.reason || "",
    itemId: item.id,
    message: "등록된 자료 중 관련 항목을 찾았습니다."
  };
}

// ==========================================
// 6. 서버 상태 확인
// ==========================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "HEALTH CHECK AI 서버가 정상적으로 작동 중입니다.",
    dataCount: healthData.length,
    aiConfigured: Boolean(openai)
  });
});

// ==========================================
// 7. 전체 검토 기록 조회
// ==========================================

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

// ==========================================
// 8. 기존 건강정보 검증 API
// ==========================================

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
      : "일치하는 자료가 충분하지 않아 추가 분석이 필요합니다."
  });
});

// ==========================================
// 9. 공식 건강정보 자료 목록
// ==========================================

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
        name: "국가암정보센터",
        description: "암 예방·진단·치료 정보",
        url: "https://www.cancer.go.kr/"
      },
      {
        name: "세계보건기구 WHO",
        description: "국제 보건 권고 및 건강정보",
        url: "https://www.who.int/"
      }
    ]
  });
});

// ==========================================
// 10. AI 응답 JSON 해석
// ==========================================

function parseAIResponse(rawText) {
  if (!rawText || typeof rawText !== "string") {
    throw new Error("AI 응답이 비어 있습니다.");
  }

  let cleaned = rawText.trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }

    throw new Error("AI 응답을 JSON 형식으로 해석하지 못했습니다.");
  }
}

// ==========================================
// 11. AI 검토 기준 보정
// ==========================================

function normalizeAIReview(review) {
  const allowedStatuses = [
    "확인 완료",
    "부분 확인",
    "확인 불가",
    "추가 확인 필요"
  ];

  const criteria = [
    "accuracy",
    "validity",
    "timeliness",
    "limitations"
  ];

  const normalized = {};

  for (const key of criteria) {
    const item = review && review[key];

    if (
      item &&
      typeof item === "object" &&
      allowedStatuses.includes(item.status)
    ) {
      normalized[key] = {
        status: item.status,
        detail:
          typeof item.detail === "string" && item.detail.trim()
            ? item.detail
            : "구체적인 평가 근거가 충분히 제공되지 않았습니다."
      };
    } else {
      normalized[key] = {
        status: "추가 확인 필요",
        detail: "평가 결과를 확인할 수 없습니다."
      };
    }
  }

  const statuses = criteria.map(
    key => normalized[key].status
  );

  const overallStatus = statuses.every(
    status => status === "확인 완료"
  )
    ? "검토 완료"
    : statuses.some(
        status => status === "확인 완료" || status === "부분 확인"
      )
      ? "부분 검토 완료"
      : "추가 확인 필요";

  return {
    overallStatus,
    ...normalized,
    checkedAt: new Date().toISOString().slice(0, 10),
    method: "공식 기관 자료 검색 및 입력 주장 대조"
  };
}

// ==========================================
// 12. AI 건강정보 분석 + 웹 검색
// ==========================================

app.post("/api/ai-check", async (req, res) => {
  const { category, text } = req.body || {};

  const allowedCategories = [
    "nutrition",
    "medicine",
    "lifestyle"
  ];

  if (
    !allowedCategories.includes(category) ||
    typeof text !== "string" ||
    !text.trim()
  ) {
    return res.status(400).json({
      success: false,
      message: "분야와 건강정보 문장을 올바르게 입력해 주세요."
    });
  }

  if (text.length > 2000) {
    return res.status(400).json({
      success: false,
      message: "건강정보는 2000자 이하로 입력해 주세요."
    });
  }

  if (!openai) {
    return res.status(500).json({
      success: false,
      message: "AI API 키가 서버에 설정되지 않았습니다."
    });
  }

  try {
    const response = await openai.responses.create({
      model: "gpt-6.2-astra",

      tools: [
        {
          type: "web_search",
          filters: {
            allowed_domains: [
              "kdca.go.kr",
              "health.kdca.go.kr",
              "mfds.go.kr",
              "foodsafetykorea.go.kr",
              "cancer.go.kr",
              "who.int"
            ]
          }
        }
      ],

      tool_choice: "required",

      instructions: `
너는 건강정보의 신뢰성을 검토하는 교육용 AI야.
반드시 웹 검색으로 실제 자료를 확인해.

검색 우선 대상은 질병관리청, 국가건강정보포털,
식품의약품안전처, 식품안전나라, 국가암정보센터, WHO야.

다음 네 가지 기준을 각각 평가해.

1. accuracy (정확성)
입력 주장의 핵심 내용이 실제 공식 자료와 일치하는지 평가해.

2. validity (타당성)
검색 자료가 입력 주장을 직접 뒷받침하는지 평가해.
단순히 관련 주제를 다루는 것과 실제 근거가 되는 것을 구분해.

3. timeliness (최신성)
자료의 게시일이나 수정일을 확인해.
날짜를 확인하지 못하면 확인 완료로 표시하지 마.
날짜가 오래되었다는 이유만으로 자료가 틀렸다고 판단하지 마.

4. limitations (한계 검토)
연령, 건강 상태, 복용량, 적용 조건, 예외 등을 확인해.
확인할 수 없는 부분은 한계로 밝혀.

각 기준의 status는 다음 중 하나만 사용해.
- 확인 완료
- 부분 확인
- 확인 불가
- 추가 확인 필요

평가 원칙:
- 실제 자료에서 확인한 내용만 확인 완료로 표시해.
- 일부만 확인되면 부분 확인으로 표시해.
- 자료가 주장을 뒷받침하지 못하면 확인 불가로 표시해.
- 근거가 부족하거나 확인할 수 없으면 추가 확인 필요로 표시해.
- 출처, 날짜, 연구 결과를 만들어내지 마.
- 최종 판정과 네 가지 검토 상태를 구분해.
- 근거가 부족하면 최종 판정은 판단 보류로 해.
- 개인 질병을 진단하거나 치료를 지시하지 마.

최종 판정은 다음 중 하나만 사용해.
근거 충분, 일부 일치, 근거와 불일치, 판단 보류.

반드시 JSON 객체만 출력해.
JSON 바깥에 설명이나 Markdown 코드 블록을 쓰지 마.

다음 구조를 지켜.

{
  "verdict": "판단 보류",
  "analysis": "판단 근거, 분석, 한계를 구체적으로 설명",
  "review": {
    "accuracy": {
      "status": "추가 확인 필요",
      "detail": "정확성 평가 근거"
    },
    "validity": {
      "status": "추가 확인 필요",
      "detail": "타당성 평가 근거"
    },
    "timeliness": {
      "status": "추가 확인 필요",
      "detail": "자료의 게시일 또는 수정일 확인 결과"
    },
    "limitations": {
      "status": "추가 확인 필요",
      "detail": "적용 대상과 한계에 대한 평가"
    }
  }
}

네 가지 기준을 모두 빠짐없이 작성해.
각 detail에는 실제로 확인한 사실과 확인하지 못한 부분을 구체적으로 적어.
`,

      input: `
분야: ${category}

검토할 건강정보:
${text}
`,

      max_output_tokens: 1600
    });

    const parsed = parseAIResponse(response.output_text || "");

    const allowedVerdicts = [
      "근거 충분",
      "일부 일치",
      "근거와 불일치",
      "판단 보류"
    ];

    const verdict = allowedVerdicts.includes(parsed.verdict)
      ? parsed.verdict
      : "판단 보류";

    const review = normalizeAIReview(parsed.review);

    // 실제 검색 결과에 포함된 URL 인용 수집
    const sources = [];

    for (const outputItem of response.output || []) {
      if (outputItem.type !== "message") continue;

      for (const contentItem of outputItem.content || []) {
        if (contentItem.type !== "output_text") continue;

        for (const annotation of contentItem.annotations || []) {
          if (annotation.type !== "url_citation") continue;

          const citation =
            annotation.url_citation || annotation;

          const url = citation.url;

          if (
            typeof url === "string" &&
            /^https?:\/\//i.test(url) &&
            !sources.some(source => source.url === url)
          ) {
            sources.push({
              title: citation.title || "참고 자료",
              url
            });
          }
        }
      }
    }

    res.json({
      success: true,
      aiAnalysis: true,
      category,
      inputText: text,
      verdict,
      analysis:
        typeof parsed.analysis === "string"
          ? parsed.analysis
          : "AI 분석 내용을 확인할 수 없습니다.",
      review,
      sources,
      sourceVerified: sources.length > 0,
      message: sources.length > 0
        ? "웹 검색에서 출처 링크를 수집했습니다. 자료의 실제 내용과 적용 범위를 직접 확인해 주세요."
        : "확인된 출처 링크가 없습니다. 추가 검증이 필요합니다."
    });

  } catch (error) {
    console.error("========== AI 분석 오류 ==========");
    console.error("오류 메시지:", error.message);
    console.error("오류 상태 코드:", error.status);
    console.error("오류 코드:", error.code || "없음");
    console.error("================================");

    res.status(500).json({
      success: false,
      message: "AI 분석 중 오류가 발생했습니다.",
      error: "AI_REQUEST_FAILED",
      detail: error.message,
      status: error.status || null
    });
  }
});

// ==========================================
// 13. 서버 실행
// ==========================================

app.listen(PORT, () => {
  console.log(
    `HEALTH CHECK AI 서버 실행 중: http://localhost:${PORT}`
  );
});
