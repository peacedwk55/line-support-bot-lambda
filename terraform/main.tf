terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# ─── DynamoDB ────────────────────────────────────────────────────────────────

resource "aws_dynamodb_table" "chat_history" {
  name         = "${var.app_name}-history"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
}

# ─── IAM Role for Lambda ─────────────────────────────────────────────────────

resource "aws_iam_role" "lambda_role" {
  name = "${var.app_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.app_name}-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem"]
        Resource = aws_dynamodb_table.chat_history.arn
      }
    ]
  })
}

# ─── Lambda Function ─────────────────────────────────────────────────────────

resource "aws_lambda_function" "bot" {
  function_name    = var.app_name
  role             = aws_iam_role.lambda_role.arn
  filename         = "${path.module}/../deploy.zip"
  source_code_hash = filebase64sha256("${path.module}/../deploy.zip")
  handler          = "src/index.handler"
  runtime          = "nodejs20.x"
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      GROQ_API_KEY                  = var.groq_api_key
      LINE_CHANNEL_ACCESS_TOKEN     = var.line_channel_access_token
      LINE_CHANNEL_SECRET           = var.line_channel_secret
      DYNAMODB_TABLE                = aws_dynamodb_table.chat_history.name
      UPSTASH_VECTOR_REST_URL       = var.upstash_vector_rest_url
      UPSTASH_VECTOR_REST_TOKEN     = var.upstash_vector_rest_token
    }
  }
}

# ─── API Gateway ─────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "bot" {
  name          = "${var.app_name}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "bot" {
  api_id             = aws_apigatewayv2_api.bot.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.bot.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_route" "webhook" {
  api_id    = aws_apigatewayv2_api.bot.id
  route_key = "POST /webhook"
  target    = "integrations/${aws_apigatewayv2_integration.bot.id}"
}

resource "aws_apigatewayv2_route" "chat" {
  api_id    = aws_apigatewayv2_api.bot.id
  route_key = "POST /chat"
  target    = "integrations/${aws_apigatewayv2_integration.bot.id}"
}

resource "aws_apigatewayv2_route" "chat_options" {
  api_id    = aws_apigatewayv2_api.bot.id
  route_key = "OPTIONS /chat"
  target    = "integrations/${aws_apigatewayv2_integration.bot.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.bot.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gw" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.bot.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.bot.execution_arn}/*/*"
}
